const request = require('supertest');
const { app, server } = require('../index'); // Import both app and the server instance

// Use a longer timeout for integration tests
jest.setTimeout(10000);

describe('API Integration Tests', () => {

  // This hook ensures the server is closed after all tests have run
  afterAll((done) => {
    server.close(done);
  });

  describe('GET /ping', () => {
    it('should return 200 and pong', async () => {
      const response = await request(app).get('/ping');
      expect(response.status).toBe(200);
      expect(response.text).toBe('pong');
    });
  });

  describe('GET /sessions', () => {
    it('should return 200 and an array (likely empty at start)', async () => {
        const response = await request(app).get('/sessions');
        expect(response.status).toBe(200);
        // It should be an array, but not necessarily empty if sessions persist
        expect(Array.isArray(response.body)).toBe(true);
      });
  });
});
