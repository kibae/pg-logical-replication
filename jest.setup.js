// jest.setup.js
if (!Object.hasOwn) {
  Object.hasOwn = Function.call.bind(Object.prototype.hasOwnProperty);
}
