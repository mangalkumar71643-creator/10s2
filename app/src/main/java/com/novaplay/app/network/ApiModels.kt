package com.novaplay.app.network

data class RegisterRequest(val name: String?, val email: String, val password: String)
data class LoginRequest(val email: String, val password: String)
data class OtpRequestBody(val phone: String)
data class OtpVerifyRequest(val phone: String, val code: String, val name: String? = null)

data class UserDto(
    val id: Long,
    val name: String?,
    val email: String?,
    val phone: String?,
    val phoneVerified: Boolean
)

data class AuthResponse(val token: String, val user: UserDto)
data class OtpRequestResponse(val message: String, val expiresInSeconds: Long, val testOtp: String?)
data class ApiErrorBody(val error: String?)
