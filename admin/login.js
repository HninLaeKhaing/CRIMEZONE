'use strict';

const form = document.getElementById('adminLoginForm');
const errorMessage = document.getElementById('adminLoginError');
const submitButton = document.getElementById('adminLoginButton');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorMessage.hidden = true;
  submitButton.disabled = true;
  submitButton.textContent = 'Signing in…';

  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: document.getElementById('adminUsername').value.trim(),
        password: document.getElementById('adminPassword').value,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to sign in.');
    window.location.replace('/admin');
  } catch (error) {
    errorMessage.textContent = error.message;
    errorMessage.hidden = false;
    submitButton.disabled = false;
    submitButton.textContent = 'Sign in securely';
  }
});
