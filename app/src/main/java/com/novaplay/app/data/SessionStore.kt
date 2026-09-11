package com.novaplay.app.data

import android.content.Context
import com.novaplay.app.network.UserDto

/** Minimal local session persistence - just enough to remember who's logged in. */
class SessionStore(context: Context) {
    private val prefs = context.getSharedPreferences("nova_play_session", Context.MODE_PRIVATE)

    fun save(token: String, user: UserDto) {
        prefs.edit()
            .putString("token", token)
            .putLong("user_id", user.id)
            .putString("user_name", user.name)
            .putString("user_email", user.email)
            .putString("user_phone", user.phone)
            .apply()
    }

    fun token(): String? = prefs.getString("token", null)

    fun clear() = prefs.edit().clear().apply()
}
