// Entry point with proper ES6 imports and logging
const timestamp = () => new Date().toISOString();

console.log(`[${timestamp()}] [INDEX] ===== APP INITIALIZATION START (ES6 imports) =====`);
console.log(`[${timestamp()}] [INDEX] ENV: DEV=${global.__DEV__}, NODE_ENV=${process.env.NODE_ENV}`);

// Just import expo-router/entry directly - this is the standard Expo way
// expo-router/entry handles all initialization and component registration
import 'expo-router/entry';
