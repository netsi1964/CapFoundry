export default function () {
  // Deliberately unkillable by promise rejection alone: only a process kill
  // stops this, which is exactly what the timeout must do.
  while (true) { /* spin */ }
}
