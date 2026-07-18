export function debounce(fn, waitMs) {
  let timer = 0;
  return function debounced(...args) {
    if (timer) clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = 0;
      fn.apply(this, args);
    }, waitMs);
  };
}
