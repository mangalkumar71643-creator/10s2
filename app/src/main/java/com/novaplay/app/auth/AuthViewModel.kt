package com.novaplay.app.auth

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.novaplay.app.data.SessionStore
import com.novaplay.app.network.ApiClient
import com.novaplay.app.network.ApiErrorBody
import com.novaplay.app.network.AuthResponse
import com.novaplay.app.network.LoginRequest
import com.novaplay.app.network.OtpRequestBody
import com.novaplay.app.network.OtpVerifyRequest
import com.novaplay.app.network.UserDto
import com.google.gson.Gson
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import retrofit2.Response

/** Which step of the phone-OTP flow the user is on. */
enum class OtpStage { ENTER_PHONE, ENTER_CODE }

data class AuthUiState(
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val infoMessage: String? = null,
    val loggedInUser: UserDto? = null,
    val otpStage: OtpStage = OtpStage.ENTER_PHONE
)

class AuthViewModel(application: Application) : AndroidViewModel(application) {
    private val sessionStore = SessionStore(application)
    private val gson = Gson()

    private val _uiState = MutableStateFlow(AuthUiState())
    val uiState: StateFlow<AuthUiState> = _uiState

    fun loginWithEmail(email: String, password: String) {
        if (email.isBlank() || password.isBlank()) {
            _uiState.update { it.copy(errorMessage = "Enter email and password") }
            return
        }
        runCall {
            ApiClient.service.login(LoginRequest(email.trim(), password))
        }
    }

    fun requestPhoneOtp(phone: String) {
        if (phone.length != 10) {
            _uiState.update { it.copy(errorMessage = "Enter a valid 10-digit mobile number") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null, infoMessage = null) }
            try {
                val response = ApiClient.service.requestOtp(OtpRequestBody(phone))
                if (response.isSuccessful && response.body() != null) {
                    val body = response.body()!!
                    val hint = body.testOtp?.let { "Test mode - OTP is $it" }
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            otpStage = OtpStage.ENTER_CODE,
                            infoMessage = hint ?: "OTP sent to $phone"
                        )
                    }
                } else {
                    _uiState.update { it.copy(isLoading = false, errorMessage = parseError(response)) }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, errorMessage = networkErrorMessage(e)) }
            }
        }
    }

    fun verifyPhoneOtp(phone: String, code: String) {
        if (code.length != 6) {
            _uiState.update { it.copy(errorMessage = "Enter the 6-digit OTP") }
            return
        }
        runCall {
            ApiClient.service.verifyOtp(OtpVerifyRequest(phone, code))
        }
    }

    fun resetOtpFlow() {
        _uiState.update { it.copy(otpStage = OtpStage.ENTER_PHONE, errorMessage = null, infoMessage = null) }
    }

    fun dismissMessages() {
        _uiState.update { it.copy(errorMessage = null, infoMessage = null) }
    }

    fun logout() {
        sessionStore.clear()
        _uiState.value = AuthUiState()
    }

    private fun runCall(block: suspend () -> Response<AuthResponse>) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null, infoMessage = null) }
            try {
                val response = block()
                if (response.isSuccessful && response.body() != null) {
                    val body = response.body()!!
                    sessionStore.save(body.token, body.user)
                    _uiState.update {
                        it.copy(isLoading = false, loggedInUser = body.user, infoMessage = "Welcome!")
                    }
                } else {
                    _uiState.update { it.copy(isLoading = false, errorMessage = parseError(response)) }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, errorMessage = networkErrorMessage(e)) }
            }
        }
    }

    private fun parseError(response: Response<*>): String {
        val raw = response.errorBody()?.string()
        return try {
            gson.fromJson(raw, ApiErrorBody::class.java)?.error ?: "Something went wrong"
        } catch (e: Exception) {
            "Something went wrong"
        }
    }

    private fun networkErrorMessage(e: Exception): String =
        "Couldn't reach the server. Check your connection and try again."
}
