module.exports = {
  client: {
    service: "techtalk-20210809@develop",
    includes: ['./test/specs/*.spec.ts'],
    excludes: ['**/node_modules'],
    tagName: 'gql',
    target: "typescript"
  }
};