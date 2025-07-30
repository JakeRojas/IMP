const registryMap = new Map();

module.exports = { 
    register, 
    get 
};

function register(key, fn) {
  if (registryMap.has(key)) {
    throw new Error(`Handler for "${key}" already registered`);
  }
  registryMap.set(key, fn);
}
function get(key) {
  return registryMap.get(key);
}