var test = require('node:test');
var assert = require('node:assert/strict');

var invoice = require('../lib/invoice');
var pricing = require('../lib/pricing');
var reports = require('../lib/reports');

function hsnOrder() {
  var items = [
    { id: 1, name: 'Rice', hsn: '1006', price: 640, qty: 1 },
    { id: 2, name: 'Tea', hsn: '0902', price: 140, qty: 1 }
  ];
  var billed = pricing.computeTotals(items, 'SAVE10');

  return {
    id: 42,
    date: '01/01/2022',
    customer: 'In-memory customer',
    items: items,
    coupon: 'SAVE10',
    subtotal: billed.subtotal,
    discount: billed.discount,
    tax: billed.tax,
    total: billed.total
  };
}

test('invoice uses the billed HSN GST slabs', function () {
  var order = hsnOrder();
  var billed = pricing.computeTotals(order.items, order.coupon);
  var printed = invoice.computeInvoiceFigures(order);

  assert.deepEqual(
    billed.lines.map(function (line) { return line.gstPercent; }),
    [5, 18]
  );
  assert.deepEqual(
    printed.rows.map(function (row) { return row.gstPercent; }),
    [5, 18]
  );
  assert.equal(billed.tax, 51.48);
  assert.equal(printed.tax, 51.48);
});

test('invoice applies a percent coupon before GST, as billed', function () {
  var order = hsnOrder();
  var billed = pricing.computeTotals(order.items, order.coupon);
  var printed = invoice.computeInvoiceFigures(order);

  assert.equal(billed.discount, 78);
  assert.equal(printed.discount, 78);
  assert.equal(printed.total, billed.total);
  assert.equal(printed.total, 753.48);
});

test('invoice exposes a CGST/SGST split only in figures and renders the combined GST amount', function () {
  var figures = invoice.computeInvoiceFigures({
    items: [{ name: 'Explicit-rate item', price: 101, qty: 1, gstRate: 5 }],
    coupon: ''
  });
  var html = invoice.render({
    id: 43,
    date: '01/01/2022',
    items: [{ name: 'Explicit-rate item', price: 101, qty: 1, gstRate: 5 }],
    coupon: ''
  });

  assert.deepEqual(
    { tax: figures.tax, cgst: figures.cgst, sgst: figures.sgst },
    { tax: 5.05, cgst: 2.53, sgst: 2.52 }
  );
  assert.match(html, /CGST \+ SGST \(Total GST\)<\/td><td class="r">₹5\.05<\/td>/);
  assert.doesNotMatch(html, />CGST<\/td>/);
  assert.doesNotMatch(html, />SGST<\/td>/);
});

test('reconciliation matches a printable invoice to its order ledger', function () {
  var order = hsnOrder();
  var reconciliation = reports.getGstReconciliation({ orders: [order] });

  assert.equal(reconciliation.totalChecked, 1);
  assert.equal(reconciliation.mismatchCount, 0);
  assert.equal(reconciliation.totalDelta, 0);
  assert.deepEqual(reconciliation.rows[0], {
    orderId: 42,
    date: '01/01/2022',
    customer: 'In-memory customer',
    coupon: 'SAVE10',
    ledgerSubtotal: 780,
    ledgerDiscount: 78,
    ledgerTax: 51.48,
    ledgerTotal: 753.48,
    invoiceDiscount: 78,
    invoiceTax: 51.48,
    invoiceTotal: 753.48,
    delta: 0,
    matched: true
  });
});
