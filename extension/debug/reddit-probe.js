console.clear();
console.log('probe start');

var sels = [
  'shreddit-composer',
  '[contenteditable=true]',
  '[role=textbox]',
  'textarea',
  'faceplate-textarea-input',
  '[data-lexical-editor=true]',
  '[name=commentText]',
  '[data-testid=add-comment-button]',
  'comment-composer-host'
];

for (var i = 0; i < sels.length; i++) {
  var found = document.querySelectorAll(sels[i]);
  console.log(sels[i], '=>', found.length);
  for (var j = 0; j < found.length; j++) {
    found[j].style.outline = '3px solid lime';
  }
}

var sc = document.querySelector('shreddit-composer');
if (sc) {
  console.log('composer outerHTML:', sc.outerHTML.slice(0, 1500));
} else {
  console.log('no shreddit-composer found');
}

function probeClick(e) {
  console.log('CLICK target:', e.target);
  console.log('tag:', e.target.tagName);
  console.log('class:', e.target.className);
  console.log('id:', e.target.id);
  console.log('contenteditable:', e.target.getAttribute('contenteditable'));
  console.log('role:', e.target.getAttribute('role'));
  console.log('data-testid:', e.target.getAttribute('data-testid'));
  console.log('aria-label:', e.target.getAttribute('aria-label'));
  console.log('placeholder:', e.target.getAttribute('placeholder'));
  console.log('outerHTML:', e.target.outerHTML.slice(0, 400));
  console.log('closest composer:', e.target.closest('shreddit-composer'));
  console.log('closest editable:', e.target.closest('[contenteditable]'));
  var p = e.target.parentElement;
  for (var n = 0; n < 8 && p; n++) {
    console.log('parent', n, p.tagName, p.className, p.getAttribute('data-testid'));
    p = p.parentElement;
  }
  document.removeEventListener('click', probeClick, true);
  console.log('probe done');
}
document.addEventListener('click', probeClick, true);
console.log('ready - click the comment box now');
