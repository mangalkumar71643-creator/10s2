package com.novaplay.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.sin
import kotlin.random.Random

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            NovaPlayLoginScreen()
        }
    }
}

private val NovaGold = Color(0xFFF5C542)
private val NovaGoldDark = Color(0xFFB8860B)
private val NovaRed = Color(0xFF8B0000)
private val NovaRedBright = Color(0xFFD4232C)
private val CardBg = Color(0xFF120A0A)
private val FieldBg = Color(0xFF1A0F0F)

@Composable
fun NovaPlayLoginScreen() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
    ) {
        // Twinkling star field drawn straight onto the black background.
        // The login card below paints its own opaque background on top of it,
        // so none of this animation is ever visible inside the golden-bordered box.
        TwinklingStars(modifier = Modifier.fillMaxSize())

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(modifier = Modifier.height(28.dp))
            HeroBanner()
            Spacer(modifier = Modifier.height(18.dp))
            LoginCard()
            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

/** Hero logo art with an animated golden light sweeping across it. */
@Composable
private fun HeroBanner() {
    val transition = rememberInfiniteTransition(label = "heroSweep")
    // Goes a clean 0 -> 1 every cycle: no off-screen "dead time", so the band
    // always visibly enters from the left and fully exits on the right before restarting.
    val sweep by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 2600, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "sweepOffset"
    )

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(1280f / 1072f)
    ) {
        Image(
            painter = painterResource(id = R.drawable.nova_play_hero),
            contentDescription = "Nova Play",
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Fit
        )

        // Faint diagonal shine band that swipes left-to-right over the artwork on a loop.
        Canvas(modifier = Modifier.fillMaxSize()) {
            val bandWidth = size.width * 0.22f
            // Modest horizontal tilt relative to bandWidth, not the full image height,
            // so the band reads as a diagonal stripe instead of a near-horizontal one.
            val tilt = bandWidth * 0.5f
            // Travels from fully off-screen left to fully off-screen right.
            val centerX = -bandWidth + sweep * (size.width + 2 * bandWidth)
            val brush = Brush.linearGradient(
                colors = listOf(
                    Color.Transparent,
                    NovaGold.copy(alpha = 0.16f),
                    Color.Transparent
                ),
                start = Offset(centerX - bandWidth - tilt, 0f),
                end = Offset(centerX + bandWidth, size.height)
            )
            drawRect(brush = brush, blendMode = BlendMode.Plus)
        }
    }
}

@Composable
private fun TwinklingStars(modifier: Modifier = Modifier) {
    val starCount = 55
    val stars = remember {
        List(starCount) {
            StarSpec(
                x = Random.nextFloat(),
                y = Random.nextFloat(),
                radiusDp = Random.nextFloat() * 2.2f + 0.8f,
                phase = Random.nextFloat() * 6.28f,
                speed = Random.nextFloat() * 1.5f + 0.6f
            )
        }
    }

    val transition = rememberInfiniteTransition(label = "starTime")
    val time by transition.animateFloat(
        initialValue = 0f,
        targetValue = 100000f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 100_000_000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "time"
    )

    Canvas(modifier = modifier) {
        val w = size.width
        val h = size.height
        for (star in stars) {
            val twinkle = (sin(time * star.speed + star.phase) + 1f) / 2f
            val alpha = 0.15f + twinkle * 0.85f
            drawCircle(
                color = NovaGold.copy(alpha = alpha),
                radius = star.radiusDp.dp.toPx(),
                center = Offset(star.x * w, star.y * h)
            )
        }
    }
}

private data class StarSpec(
    val x: Float,
    val y: Float,
    val radiusDp: Float,
    val phase: Float,
    val speed: Float
)

@Composable
private fun LoginCard() {
    var isPhoneLogin by remember { mutableStateOf(true) }
    var identifier by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(22.dp))
            .background(CardBg)
            .border(
                width = 1.5.dp,
                brush = Brush.linearGradient(listOf(NovaGold, NovaGoldDark, NovaGold)),
                shape = RoundedCornerShape(22.dp)
            )
            .padding(18.dp)
    ) {
        // Tabs
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(Color(0xFF0D0808))
                .padding(4.dp)
        ) {
            TabButton(
                text = "Phone Login",
                icon = Icons.Filled.Phone,
                selected = isPhoneLogin,
                modifier = Modifier.weight(1f)
            ) { isPhoneLogin = true }
            TabButton(
                text = "Email Login",
                icon = Icons.Filled.Email,
                selected = !isPhoneLogin,
                modifier = Modifier.weight(1f)
            ) { isPhoneLogin = false }
        }

        Spacer(modifier = Modifier.height(16.dp))

        OutlinedTextField(
            value = identifier,
            onValueChange = { identifier = it },
            modifier = Modifier.fillMaxWidth(),
            placeholder = {
                Text(
                    if (isPhoneLogin) "Enter Mobile Number" else "Enter Email",
                    color = Color(0xFF8A7A6A)
                )
            },
            leadingIcon = {
                if (isPhoneLogin) {
                    Text("+91", color = NovaGold, fontSize = 14.sp, modifier = Modifier.padding(start = 8.dp))
                } else {
                    Icon(Icons.Filled.Email, contentDescription = null, tint = NovaGold)
                }
            },
            singleLine = true,
            keyboardOptions = KeyboardOptions(
                keyboardType = if (isPhoneLogin) KeyboardType.Phone else KeyboardType.Email
            ),
            shape = RoundedCornerShape(14.dp),
            colors = novaFieldColors()
        )

        Spacer(modifier = Modifier.height(14.dp))

        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("Enter Password", color = Color(0xFF8A7A6A)) },
            leadingIcon = { Icon(Icons.Filled.Lock, contentDescription = null, tint = NovaGold) },
            trailingIcon = {
                Icon(
                    imageVector = if (passwordVisible) Icons.Filled.Visibility else Icons.Filled.VisibilityOff,
                    contentDescription = null,
                    tint = Color(0xFF8A7A6A),
                    modifier = Modifier.clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null
                    ) { passwordVisible = !passwordVisible }
                )
            },
            singleLine = true,
            visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
            shape = RoundedCornerShape(14.dp),
            colors = novaFieldColors()
        )

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            "Forgot Password?",
            color = NovaGold,
            fontSize = 13.sp,
            modifier = Modifier
                .fillMaxWidth()
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null
                ) { }
                .padding(vertical = 6.dp),
            textAlign = TextAlign.End
        )

        Spacer(modifier = Modifier.height(10.dp))

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(Brush.verticalGradient(listOf(NovaRedBright, NovaRed)))
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null
                ) { },
            contentAlignment = Alignment.Center
        ) {
            Text(
                "LOGIN",
                color = Color.White,
                fontSize = 17.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.5.sp
            )
        }

        Spacer(modifier = Modifier.height(18.dp))

        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            DividerLine(modifier = Modifier.weight(1f))
            Text(
                "OR LOGIN WITH",
                color = Color(0xFF9A8A7A),
                fontSize = 11.sp,
                modifier = Modifier.padding(horizontal = 10.dp)
            )
            DividerLine(modifier = Modifier.weight(1f))
        }

        Spacer(modifier = Modifier.height(18.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            SocialOption(label = "Google") {
                Text("G", color = Color(0xFF4285F4), fontWeight = FontWeight.Bold, fontSize = 20.sp)
            }
            SocialOption(label = "Facebook") {
                Text("f", color = Color(0xFF1877F2), fontWeight = FontWeight.Bold, fontSize = 22.sp)
            }
            SocialOption(label = "OTP") {
                Icon(Icons.Filled.Phone, contentDescription = null, tint = NovaRedBright, modifier = Modifier.size(20.dp))
            }
        }

        Spacer(modifier = Modifier.height(18.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.Center
        ) {
            Text("Don't have an account? ", color = Color(0xFF9A8A7A), fontSize = 13.sp)
            Text(
                "Sign Up",
                color = NovaGold,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null
                ) { }
            )
        }
    }
}

@Composable
private fun novaFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedContainerColor = FieldBg,
    unfocusedContainerColor = FieldBg,
    focusedBorderColor = NovaGoldDark,
    unfocusedBorderColor = Color(0xFF3A2A2A),
    focusedTextColor = Color.White,
    unfocusedTextColor = Color.White,
    cursorColor = NovaGold
)

@Composable
private fun TabButton(
    text: String,
    icon: ImageVector,
    selected: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(11.dp))
            .background(if (selected) NovaRed else Color.Transparent)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null
            ) { onClick() }
            .padding(vertical = 12.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            icon,
            contentDescription = null,
            tint = if (selected) NovaGold else Color(0xFF9A8A7A),
            modifier = Modifier.size(16.dp)
        )
        Spacer(modifier = Modifier.width(6.dp))
        Text(
            text,
            color = if (selected) NovaGold else Color(0xFF9A8A7A),
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold
        )
    }
}

@Composable
private fun SocialOption(label: String, content: @Composable () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(CircleShape)
                .background(Color(0xFF1A0F0F))
                .border(1.dp, NovaGoldDark, CircleShape)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null
                ) { },
            contentAlignment = Alignment.Center
        ) {
            content()
        }
        Spacer(modifier = Modifier.height(6.dp))
        Text(label, color = Color(0xFF9A8A7A), fontSize = 11.sp)
    }
}

@Composable
private fun DividerLine(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .height(1.dp)
            .background(Color(0xFF3A2A2A))
    )
}
