/* Inject after mobile.html's scripts in a disposable preview. Does not call real APIs. */
(async () => {
  const report = [], app = window.__mobileDemo;
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const click = (action, selector = '') => {
    const el = document.querySelector(`[data-action="${action}"]${selector}`);
    assert(el && !el.disabled, `Missing enabled action ${action}${selector}`);
    el.click();
  };
  const fill = (name, value) => {
    const el = document.querySelector(`[name="${name}"]`);
    assert(el, `Missing field ${name}`);
    if (el.type === 'checkbox') el.checked = Boolean(value); else el.value = String(value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const submit = () => {
    const el = document.querySelector('form[data-submit]');
    assert(el, 'Missing form');
    el.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  };
  const state = () => app.getState(), ui = () => app.getUI();
  const good = name => { assert(!ui().error, name + ': ' + ui().error); report.push(name); };
  const acquireLine = (kind, opts = {}) => {
    app.route('acquire'); click('startAcquire', `[data-kind="${kind}"]`);
    fill('contact', opts.contact || state().contacts[0].id); submit();
    click('manualLine'); fill('name', opts.name || 'Carte test'); fill('number', '60/106');
    if (kind === 'supplier') { fill('qty', opts.qty || 2); fill('type', opts.type || 'display'); fill('cost', '10'); }
    if (opts.company) { fill('newCompany', opts.company); fill('grade', 'Authentic'); }
    fill('price', '30'); submit(); click('wizardNext'); submit();
  };
  try {
    assert(app, 'Prototype API missing'); click('resetDemo'); app.tab('Stock');
    assert(state().items.length >= 30 && state().contacts.length >= 15 && state().sales.length >= 15, 'Insufficient seed data');
    click('page', '[data-delta="1"]'); assert(ui().page === 2, 'Pagination did not move');
    const search = document.querySelector('#search'); search.value = 'Pikachu'; search.dispatchEvent(new Event('input', { bubbles: true }));
    assert(ui().page === 1, 'Search must reset pagination'); good('Stock pagination and local search');

    app.route('companies'); fill('name', 'Custom Grader'); submit(); assert(state().companies.includes('Custom Grader'), 'Company not added');
    app.route('contacts'); click('newContact'); fill('name', 'Client test'); fill('email', 'client@example.test'); submit();
    assert(state().contacts.some(c => c.name === 'Client test'), 'Contact not created'); good('Contact and custom grading creation');

    acquireLine('purchase', { company: 'Libre Grading' }); click('saveDraft');
    assert(state().drafts.length === 1, 'Draft missing'); click('drafts'); click('resumeDraft'); click('confirmAcquire');
    const purchase = state().purchases.at(-1); assert(purchase.lines[0].company === 'Libre Grading', 'Custom grading lost');
    assert(state().drafts.length === 0 && purchase.total === 1960, 'Draft not removed or valuation wrong');
    click('prepareDoc'); fill('clientSignature', 'Client test'); fill('shopSignature', 'Boutique test'); fill('consent', true); submit();
    assert(state().documents.at(-1).signed, 'Document not signed'); good('Buyback, local draft resume, valuation and signed archive');

    acquireLine('supplier', { name: 'Display test', qty: 2, type: 'display' }); click('confirmAcquire');
    const receipt = state().purchases.at(-1), source = state().items.find(i => i.id === receipt.itemIds[0]);
    assert(source.qty === 2 && source.lots[0].cost === 2000 && !source.visible, 'Supplier receipt wrong');
    app.route('opening', { id: source.id }); fill('qty', 1); fill('packSize', 3); fill('name', 'Booster test'); submit(); click('confirmOpening');
    const opening = state().openings.at(-1), booster = state().items.find(i => i.id === opening.targetId);
    assert(booster.qty === 3 && booster.lots[0].cost === 1000 && source.qty === 1, 'Opening cost transfer wrong');
    click('undoOpening'); assert(source.qty === 2 && booster.qty === 0, 'Opening reversal wrong'); good('Supplier receipt, exact display conversion and reversal');

    app.route('item', { id: source.id }); click('addCart'); app.tab('Vendre'); click('cart'); submit();
    fill('mode', 'mixed'); fill('cash', '1'); fill('transfer', '1'); submit();
    assert(ui().error.includes('exactement'), 'Mixed payment validation missing');
    fill('mode', 'pending'); submit();
    const sold = state().sales.at(-1); assert(sold.payment.mode === 'pending' && source.qty === 1, 'Sale did not consume stock');
    click('editPayment'); fill('mode', 'mixed'); fill('cash', '10'); fill('transfer', '20'); submit();
    assert(sold.payment.cash === 1000 && sold.payment.transfer === 2000, 'Payment correction wrong');
    click('cancelSaleAsk'); click('executeConfirm');
    assert(sold.status === 'cancelled' && source.qty === 2 && source.lots.reduce((n, l) => n + l.cost, 0) === 2000, 'Cancellation did not restore exact allocation');
    good('Basket, invalid mixed payment, pending sale, correction and cancellation');

    app.route('gift', { id: source.id }); fill('recipient', 'Association test'); fill('reason', 'Lot de démonstration'); submit(); click('confirmGift');
    const gift = state().gifts.at(-1); assert(gift.cost === 1000 && source.qty === 1, 'Gift wrong'); click('undoGift'); assert(source.qty === 2 && gift.cancelled, 'Gift reversal wrong'); good('Gift and stock restoration');

    acquireLine('consignment', { name: 'Dépôt test' }); click('confirmAcquire');
    const dossier = state().consignments.at(-1); assert(!dossier.signed, 'New consignment signed too early');
    click('prepareDoc'); fill('clientSignature', 'Déposant'); fill('shopSignature', 'Boutique'); fill('consent', true); submit(); assert(dossier.signed, 'Consignment signature missing');
    app.route('returnItems', { id: dossier.id }); fill('return_' + dossier.itemIds[0], true); fill('notes', 'État vérifié'); submit();
    const returnDoc = state().documents.at(-1); assert(returnDoc.kind === 'return', 'Return document missing');
    fill('clientSignature', 'Déposant'); fill('shopSignature', 'Boutique'); fill('consent', true); submit();
    assert(state().items.find(i => i.id === dossier.itemIds[0]).qty === 0, 'Signed return did not remove stock'); good('Consignment contract and signed return');

    app.route('payout', { id: 'co1' }); fill('amount', '10'); submit(); assert(state().payouts.at(-1).amount === 1000, 'Partial payout failed'); good('Partial depositor payout');

    app.route('document', { id: returnDoc.id });
    const scenario = document.querySelector('#scenario'); scenario.value = 'email'; scenario.dispatchEvent(new Event('change', { bubbles: true }));
    fill('email', 'recipient@example.test'); submit(); assert(returnDoc.delivery === 'failed', 'Email failure not simulated');
    fill('email', 'recipient@example.test'); submit(); assert(returnDoc.delivery === 'accepted', 'Email retry failed'); good('Email failure and retry');

    app.route('account'); click('logout'); fill('email', 'demo@example.test'); fill('password', 'demo'); submit(); assert(state().auth, 'Login failed'); good('Demo logout and login');

    const original = window.CartelitesSearch;
    window.CartelitesSearch = { search: async (query, language, options) => ({ cards: [{ id: 'test-60', name: 'Provider test', localId: '60', printedNumber: '60/106', setId: 'test', setName: 'Test set', language, image: '' }], note: 'Test transport only', hasMore: options.page === 1, page: options.page }) };
    app.route('acquire'); click('startAcquire', '[data-kind="purchase"]'); fill('contact', 'c0'); submit(); click('lookup'); fill('term', '60/106'); fill('language', 'en'); submit();
    await Promise.resolve(); await Promise.resolve();
    assert(ui().lookupResults[0].name === 'Provider test' && ui().lookupLanguage === 'en', 'Provider response not bound');
    click('cataloguePage', '[data-delta="1"]'); await Promise.resolve(); await Promise.resolve(); assert(ui().lookupPage === 2, 'Provider pagination failed');
    click('chooseCatalogue'); assert(document.querySelector('[name="number"]').value === '60/106', 'Selected identifier lost');
    window.CartelitesSearch = original; good('Live-search adapter wiring, language, provider pagination and selection');

    click('resetDemo');
    console.log('MOBILE_CHECK_RESULT ' + JSON.stringify({ passed: report.length, checks: report }));
  } catch (error) {
    console.error('MOBILE_CHECK_RESULT ' + JSON.stringify({ passed: report.length, checks: report, error: error.message, screen: ui()?.screen }));
    throw error;
  }
})();
