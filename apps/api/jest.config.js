module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  transform: {
    "^.+\\.(t|j)s$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.spec.json" }],
  },
  roots: ["<rootDir>/src", "<rootDir>/test"],
  testRegex: ".*\\.spec\\.ts$",
  moduleFileExtensions: ["ts", "js", "json"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  collectCoverageFrom: ["src/modules/**/*.service.ts"],
};
