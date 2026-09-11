package com.novaplay.app.network

/**
 * Points at the Nova Play backend (see /server in the repo), deployed on
 * Vercel. It currently uses an in-memory store when running there, so
 * registered users / OTPs reset whenever the serverless function cold-starts
 * - fine for testing, not for real data. Swap in a hosted database (and a
 * real SMS provider for OTP) before this needs to be durable for real users.
 */
const val BASE_URL = "https://novaplay-api.vercel.app/"
