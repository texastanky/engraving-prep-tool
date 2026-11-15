# Portable project files

Use **Save Project** in the toolbar or **File → Save Project…** to download an
`.engraving-project.json` file. Keep the download: ordinary PNG, SVG, JPEG and
PDF exports are output artwork, not editable project backups.

Use **File → Open Project…** to restore it. The file includes:

- Embedded artwork and reference photo, independent of the original file path.
- Material dimensions, units, artwork size, placement, rotation and flips.
- Filters, clipping masks, keep-outs, warp pins, eraser mask and part copies.
- Editable vectors, their operations and control points, and the pen trace.

The saved canvas coordinate space is retained when opening on a different
screen, so physical artwork dimensions and placement do not depend on the
new viewport. Zoom, selection and undo history are not part of the file.
Shop/account details, licence credentials and the converter's separate preset
library are not included.

Project files are local downloads, not cloud backups. Browser settings autosave
still does not retain uploaded images. Unsaved project changes warn before page
reload, navigation or desktop close. Downloading an SVG does not clear this
warning. After downloading a project, check that the file reached your Downloads
folder before closing the app.

Opening another project asks before replacing unsaved work. Unsupported versions,
invalid documents, inaccessible embedded images and files over 80 MB leave the
current work untouched. No network image locations are accepted when opening.

## Verification

```bash
pnpm test
node --test desktop/project-warning.test.cjs
pnpm build
```

Test a real round-trip by placing a raster image and vector shape, downloading a
project, changing the placement, and opening the downloaded file. Confirm both
Cancel and Replace behavior. Repeat after resizing the window, and compare
physical dimensions. Windows installation and native close-dialog verification
still require a Windows build/run; the unit test checks the close-handler logic.

## Importing output SVGs

Editable SVG import preserves the document's absolute physical dimensions and
page origin when its root has supported dimensions (mm, cm, in, pt, pc, px, or
unitless SVG pixels at 96 dpi). `viewBox` origin and aspect alignment are applied.
Cut/score/engrave operation groups from this editor are retained.

Art without an absolute document size is fitted with a warning rather than
labelled actual-size. Art that extends past the material is not silently shrunk;
the app warns so it can be repositioned or resized intentionally. SVG import
does not replace Open Project for restoring images, filters or masks.

The header controls wrap and reference panels stack on narrow browser windows,
including when the beside-canvas panel option is selected. Phone viewport checks are
not certification of real iOS/Android touch, file-picker or download behavior.
