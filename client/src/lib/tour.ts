import { driver } from 'driver.js';

const steps = [
  { element: '[data-tour="app-brand"]', popover: { title: 'Welcome to SNOQ', description: 'Your personal resource vault keeps useful links, notes, and files together.' } },
  { element: '[data-tour="add-resource"]', popover: { title: 'Add anything worth keeping', description: 'Save a link, note, document, image, or video. SNOQ handles the organization.' } },
  { element: '[data-tour="main-navigation"]', popover: { title: 'Your vault navigation', description: 'Move between your dashboard, library, favorites, archived items, and settings here.' } },
  { element: '[data-tour="nav-dashboard"]', popover: { title: 'Dashboard', description: 'See your collection at a glance and return to recent work.' } },
  { element: '[data-tour="nav-library"]', popover: { title: 'Library', description: 'Browse, search, and filter every resource you have saved.' } },
  { element: '[data-tour="nav-lists"]', popover: { title: 'Lists', description: 'Create focused collections and add resources to them while you save.' } },
  { element: '[data-tour="nav-favorites"]', popover: { title: 'Favorites', description: 'Keep your most useful resources within easy reach.' } },
  { element: '[data-tour="nav-archived"]', popover: { title: 'Archive', description: 'Put less active resources away without losing them.' } },
  { element: '[data-tour="nav-settings"]', popover: { title: 'Settings', description: 'Manage your profile, password, appearance, and replay this tour any time.' } },
  { element: '[data-tour="app-footer"]', popover: { title: 'You are ready', description: 'Use the footer for product information and policy links whenever you need them.' } },
] as const;

export function startSiteTour() {
  const visibleSteps = steps.filter((step) => {
    const element = document.querySelector(step.element);
    return element && element.getClientRects().length > 0;
  });
  driver({
    animate: true,
    showProgress: true,
    overlayColor: '#09152b',
    steps: visibleSteps,
  }).drive();
}
