# Installer, code signing and releases

## Building the installer

```bash
pnpm build:installer
```

Produces `desktop-dist/EngravingPrepTool-Setup-<version>.exe`.

What this build is configured to do:

- **Per-user install** (`perMachine: false`, `allowElevation: false`), so it does
  not need an administrator account. Shop PCs are often locked down.
- A real uninstall entry (`uninstallDisplayName`), Start menu and desktop
  shortcuts, and a finish-page launch.
- App metadata embedded in the executable, taken from `package.json`:
  `ProductName`, `CompanyName` and version all show up in the file properties.
- `asar` packaging, `compression: normal` (not `maximum`) so installation is
  quick — the payload is already ~100 MB because Electron is bundled.

Installer options live in the `build` block of `package.json`.

## Why code signing matters

Without a signature Windows shows **"unknown publisher"** in SmartScreen when a
customer runs the installer, and some managed machines refuse outright. Check
the current state of any build with:

```powershell
Get-AuthenticodeSignature .\desktop-dist\EngravingPrepTool-Setup-0.1.4.exe | Select-Object Status, SignerCertificate
```

An unsigned build reports `NotSigned`. Both the installer _and_ the app
executable (`win-unpacked\Engraving Prep Tool.exe`) need to be signed;
electron-builder signs everything it emits once it has a certificate.

## Windows path length (bites before signing does)

The NSIS step runs `makensis.exe`, which is not long-path aware. With pnpm's
default isolated layout the files it needs live under:

```
node_modules/.pnpm/app-builder-lib@<version>_<hash>/node_modules/app-builder-lib/templates/nsis/include/...
```

On a deep checkout that exceeds Windows' 260-character limit and the build fails
with:

```
!include: could not open file: "...allowOnlyOneInstallerInstance.nsh"
```

Two defences, both applied here:

1. `nodeLinker: hoisted` in `pnpm-workspace.yaml`. A hoisted `node_modules` puts
   the same files ~100 characters shallower. Run `pnpm install` once after
   pulling this change so the layout is rebuilt.
2. Keep the project path short (for example `C:\dev\engraving-prep-tool`).
   A path under `C:\Users\<you>\OneDrive\Documents\...` is the risky case.

## Getting a certificate

Since June 2023 the CA/Browser Forum requires OV and EV code-signing private keys
to live in FIPS 140-2/3 hardware or an equivalent qualified service. In practice
that means a downloadable `.pfx` is no longer issued for new certificates, so
plan for one of these routes:

### 1. Azure Trusted Signing (best fit for a small shop)

Roughly $10/month, Microsoft-run, and it builds SmartScreen reputation quickly.
The electron-builder version this project uses (26.x) supports it natively:

```jsonc
// package.json -> build.win
"azureSignOptions": {
  "publisherName": "Pete's Guns and Stuff LLC",   // must match your identity
  "endpoint": "https://<region>.codesigning.azure.net",
  "certificateProfileName": "<profile>",
  "codeSigningAccountName": "<account>"
  // fileDigest defaults to SHA256
  // timestampRfc3161 defaults to http://timestamp.acs.microsoft.com
}
```

Authentication uses Microsoft Entra ID through the standard environment
credential variables (`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`,
`AZURE_CLIENT_SECRET`) — see Microsoft's EnvironmentCredential documentation.
Set those as CI secrets, never in the repo.

### 2. Cloud signing services (SSL.com eSigner, DigiCert KeyLocker)

These run the HSM for you and give you a CLI. Wire it up with a custom sign hook
in `build.win.signtoolOptions.sign`, pointing at a small script that calls their
tool with the file path electron-builder passes in.

### 3. Physical token or HSM

An EV certificate on a USB token works with `signtool`, and electron-builder can
use it when the token is present:

```jsonc
"signtoolOptions": {
  "certificateSubjectName": "Pete's Guns and Stuff LLC",  // EV, Windows only
  "certificateSha1": "<thumbprint>"                       // when several match
}
```

### Legacy exportable certificate

Only relevant if you already hold an older certificate that is still exportable:
set `WIN_CSC_LINK` (path or base64 of the `.pfx`) and `WIN_CSC_KEY_PASSWORD`, or
`certificateFile` / `certificatePassword` under `signtoolOptions`. electron-builder
signs automatically when those are present, with no config change.

Timestamping is always worth keeping on — electron-builder's default
(`http://timestamp.digicert.com`) means signatures stay valid after the
certificate expires.

## Failing the build when signing is missing

For CI, make an unsigned build fail loudly instead of shipping quietly:

```bash
pnpm exec electron-builder --win nsis --x64 --publish never --config.forceCodeSigning=true
```

## Release checklist

1. Bump `version` in `package.json` (it drives the installer name, the embedded
   file version and the update manifest).
2. `pnpm test` and `pnpm build` — the build script type-checks first.
3. `pnpm build:installer`.
4. Verify the signature on both the installer and the app executable.
5. Install it on a clean machine (or a VM) and confirm the app launches from the
   Start menu shortcut.
6. Upload the installer, then publish the update manifest so existing installs
   see the new version (`VITE_UPDATE_MANIFEST_URL` points at it).
7. Note what changed for customers — a short changelog prevents support calls.

## Current state

Verified on 2026-09-15 with electron-builder 26.15.3:

| Check                      | Result                                              |
| -------------------------- | --------------------------------------------------- |
| Installer produced         | `EngravingPrepTool-Setup-0.1.4.exe`, 102.4 MB       |
| Product / company metadata | "Engraving Prep Tool" / "Pete's Guns and Stuff LLC" |
| File version               | 0.1.4                                               |
| Signature                  | **NotSigned**                                       |

The only thing standing between this and a clean release is the certificate.

## Other build failures and what they mean

**`EBUSY: resource busy or locked, unlink '...win-unpacked.tmp\resources\default_app.asar'`**

Something is holding a handle on the freshly extracted Electron files. In order
of likelihood:

1. **The app is running.** Close it (and any `electron.exe` in Task Manager)
   before building. This is the usual cause.
2. **Antivirus / endpoint protection** scanning the new files. Retrying after a
   few seconds normally succeeds; adding the project folder to the exclusion
   list fixes it permanently.
3. **A file watcher or backup agent** on the project folder. Building with
   `-c.directories.output=<path outside the watched folder>` sidesteps it:

   ```bash
   pnpm exec electron-builder --win nsis --x64 --publish never \
     -c.directories.output="C:/build/engraving-prep-tool"
   ```

**`!include: could not open file: "...allowOnlyOneInstallerInstance.nsh"`**

The Windows path-length problem described above. Shorten the checkout path, or
set `nodeLinker: hoisted` and reinstall.
