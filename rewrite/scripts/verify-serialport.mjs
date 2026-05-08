// Minimal verification that serialport loads and SerialPort.list() works
// Run from rewrite/: node scripts/verify-serialport.mjs

try {
  const { SerialPort } = await import('serialport');

  console.log('serialport loaded successfully');
  console.log('SerialPort class:', typeof SerialPort);

  const ports = await SerialPort.list();
  console.log('SerialPort.list() returned:', ports.length, 'port(s)');
  for (const port of ports) {
    console.log(' -', port.path, port.manufacturer || '(unknown manufacturer)');
  }

  console.log('\nVerification PASSED');
  process.exit(0);
} catch (err) {
  console.error('Verification FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
}
