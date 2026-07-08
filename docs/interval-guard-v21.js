const nativeSetInterval = window.setInterval.bind(window);
window.__expenseFlowBlockedIntervals = [];
window.setInterval = (fn, delay, ...args) => {
  const source = String(fn || '');
  const shouldBlock =
    (delay === 5000 && source.includes('renderAll')) ||
    (delay === 1200 && source.includes('applyFixes'));
  if (shouldBlock) {
    console.warn('ExpenseFlow blocked legacy auto-refresh interval to prevent table blinking.', { delay, source });
    window.__expenseFlowBlockedIntervals.push({ delay, source });
    return 0;
  }
  return nativeSetInterval(fn, delay, ...args);
};
console.log('ExpenseFlow interval guard v21 active');
