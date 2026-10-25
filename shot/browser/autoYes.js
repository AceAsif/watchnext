// Test helper: answer the app's in-app questions (appDialogs.askConfirm) with "yes", the way
// these suites used to accept the browser's confirm() pop-ups. The question's text is kept in
// window.__lastAsk so a test can check the wording. Use: await page.evaluateOnNewDocument(AUTO_YES)
export const AUTO_YES = () => {
  new MutationObserver(() => {
    const b = document.querySelector('[data-testid=ask-yes]');
    if (!b || b.__answered) return;
    b.__answered = true;
    const d = b.closest('[role=alertdialog]');
    window.__lastAsk = d ? d.innerText : '';
    setTimeout(() => b.click(), 0);
  }).observe(document, { childList: true, subtree: true });
};
