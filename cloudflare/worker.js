import publicKey from "../server/license-public.pem";
import { handleRequest } from "./router.js";

export default {
  fetch(request, env) {
    return handleRequest(request, env, publicKey);
  },
};
