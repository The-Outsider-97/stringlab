'use strict';
// The only functions evaluated by the trusted Rust host while loading.
window.stringlabStartupError = (message) => {
  const indicator = document.querySelector('.spinner');
  if (indicator) indicator.hidden = true;
  const status = document.getElementById('message');
  if (status) status.textContent = 'The scientific engine could not start.';
  const error = document.getElementById('error');
  if (error) {
    error.hidden = false;
    error.textContent = String(message);
  }
};