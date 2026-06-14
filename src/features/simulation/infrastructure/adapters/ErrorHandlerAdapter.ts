import type { IErrorHandler } from "../../contracts/boot-dependencies.contract";
import { initErrorCapture } from "@/shared/infrastructure/observability/error-capture";
import { handleGlobalErrors } from "@/shared/infrastructure/error-handling/handleGlobalErrors";

export class ErrorHandlerAdapter implements IErrorHandler {
  init(captureCallback: (errors: string[]) => void): void {
    initErrorCapture(captureCallback);
  }
  handleErrors(errors: string[]): void {
    handleGlobalErrors(errors);
  }
}
