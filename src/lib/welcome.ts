// Has this browser seen the landing page (/welcome)? First-time visitors to /
// are sent there once, then Home works normally.

const KEY = "welcomed";

// Storage can be blocked (private windows). Then we say yes, so nobody gets
// stuck being sent to the landing page over and over.
export function hasBeenWelcomed(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return true;
  }
}

export function markWelcomed() {
  try {
    localStorage.setItem(KEY, new Date().toISOString());
  } catch {}
}
