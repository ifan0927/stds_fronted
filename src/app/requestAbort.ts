const requestAbortReason = new DOMException('Request replaced by a newer page load.', 'AbortError');

export function abortRequest(controller: AbortController | null | undefined) {
  if (!controller || controller.signal.aborted) {
    return;
  }

  controller.abort(requestAbortReason);
}
