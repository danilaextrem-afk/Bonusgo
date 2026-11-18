// Integration tests run against DATABASE_URL_TEST (a dedicated test database).
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST ?? "postgresql://postgres@127.0.0.1:5432/bonusgo_test";
process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret";
process.env.PAYMENTS_TEST_MODE = "true";
