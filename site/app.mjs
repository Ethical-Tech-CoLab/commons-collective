import { initMoneyView } from './simulation/money-view.mjs';

initMoneyView(document.querySelector('#money-view'));

const search = document.querySelector('#source-search');
const sourceItems = [...document.querySelectorAll('#references li')];
search.addEventListener('input', () => {
  const term = search.value.trim().toLocaleLowerCase();
  for (const item of sourceItems) item.hidden = !item.textContent.toLocaleLowerCase().includes(term);
  document.querySelector('#source-count').textContent =
    `${sourceItems.filter(item => !item.hidden).length} of ${sourceItems.length} sources shown`;
});

// A filtered bibliography must not hide the target of an in-text citation.
document.querySelector('#report').addEventListener('click', event => {
  const link = event.target.closest('a[href^="#ref-"]');
  if (link) {
    search.value = '';
    search.dispatchEvent(new Event('input'));
  }
});

const header = document.querySelector('.site-header');
const navigation = [...header.querySelectorAll('[data-nav]')];
const sections = [
  { name: 'overview', element: document.querySelector('#overview') },
  { name: 'research', element: document.querySelector('#report') },
  { name: 'demos', element: document.querySelector('#lab') },
  { name: 'research', element: document.querySelector('#references') },
];
let navigationFramePending = false;

function updateNavigation() {
  navigationFramePending = false;
  const height = header.getBoundingClientRect().height;
  document.documentElement.style.setProperty('--header-height', `${height}px`);
  let current = 'overview';
  for (const section of sections) {
    if (section.element.getBoundingClientRect().top <= height + 40) current = section.name;
  }
  for (const link of navigation) {
    if (link.dataset.nav === current) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
}

function scheduleNavigationUpdate() {
  if (navigationFramePending) return;
  navigationFramePending = true;
  requestAnimationFrame(updateNavigation);
}

window.addEventListener('scroll', scheduleNavigationUpdate, { passive: true });
new ResizeObserver(scheduleNavigationUpdate).observe(header);
updateNavigation();
