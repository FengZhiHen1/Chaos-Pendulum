// 纯函数和类型
export { notify } from "./notify";
export { translateError, inferErrorCodeFromMessage } from "./error-dictionary";
export { handleGlobalErrors } from "./handleGlobalErrors";
export { LONG_RUNNING_CONFIG } from "./constants";
export type {
  ErrorCode,
  ToastInput,
  ToastFunction,
  TranslateErrorInput,
  TranslateErrorOutput,
  VisibilityState,
  UseVisibilityChangeOptions,
  WorkerRecoverConfig,
} from "./types";
