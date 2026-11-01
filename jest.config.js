// Fixtures legadas representam a hora local da clínica. Fixar antes de criar
// os ambientes Jest evita resultados distintos entre máquinas e CI em UTC.
process.env.TZ = 'America/Fortaleza';

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  projects: [
    '<rootDir>/jest.node.config.js',
    '<rootDir>/jest.components.config.js',
  ],
};
