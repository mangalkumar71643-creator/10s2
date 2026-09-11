package com.novaplay.app.network

/**
 * Points at the Nova Play backend (see /server in the repo).
 *
 * 10.0.2.2 is the special alias the Android EMULATOR uses to reach "localhost"
 * on the machine running it - it will NOT work from a real phone, since the
 * phone is on a different network than wherever the server is running.
 *
 * To test on a real device: run the server (server/) on a machine that's on
 * the same Wi-Fi as the phone, then replace this with that machine's LAN IP,
 * e.g. "http://192.168.1.23:4000/" - or point it at a deployed URL once the
 * backend is hosted somewhere public.
 */
const val BASE_URL = "http://10.0.2.2:4000/"
