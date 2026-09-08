import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { createAuthRoutes } from '../../features/auth/infrastructure/routes/authRoutes.js';
test('public registration is disabled while administrator user creation remains protected', async () => {
    let registrations = 0;
    let creations = 0;
    const controller = {
        register: async (_req, res) => {
            registrations++;
            return res.sendStatus(201);
        },
        createUser: async (_req, res) => {
            creations++;
            return res.sendStatus(201);
        },
        login: async (_req, res) => res.sendStatus(200),
    };
    const app = express();
    app.use(express.json());
    app.use('/api/auth', createAuthRoutes(controller));
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/auth`;
    const token = (rol) => jwt.sign({ sub: 'test-user', rol }, env.jwtSecret, { expiresIn: '1m' });
    const request = (path, bearer, method = 'POST') => fetch(base + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
        ...(method === 'POST' ? { body: JSON.stringify({ rol: 'admin' }) } : {}),
    });
    try {
        for (const path of ['/register', '/register/', '/REGISTER', '/register?rol=admin']) {
            const response = await request(path);
            assert.equal(response.status, 403);
            assert.equal((await response.json()).error.code, 'REGISTRATION_DISABLED');
        }
        assert.equal((await request('/register', token('admin'))).status, 403);
        assert.equal((await request('/register', undefined, 'GET')).status, 403);
        assert.equal(registrations, 0);
        assert.equal((await request('/users')).status, 401);
        assert.equal((await request('/users', token('visor'))).status, 403);
        assert.equal(creations, 0);
        for (const role of ['admin', 'Administrador']) {
            assert.equal((await request('/users', token(role))).status, 201);
        }
        assert.equal(creations, 2);
        assert.equal((await request('/login')).status, 200);
    }
    finally {
        server.closeAllConnections();
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
});
