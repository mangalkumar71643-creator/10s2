package com.novaplay.app

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val TopBarColor = Color(0xFF151112)
private val PillBg = Color(0xFF0D0808)
private val CoinGoldLight = Color(0xFFFFE082)
private val CoinGoldDark = Color(0xFFB8860B)
private val WalletRedBright = Color(0xFFD4232C)
private val WalletRedDark = Color(0xFF8B0000)

@Composable
fun HomeScreen() {
    Box(modifier = Modifier.fillMaxSize()) {
        Image(
            painter = painterResource(id = R.drawable.home_background),
            contentDescription = null,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop
        )

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(70.dp)
                .background(TopBarColor)
                .align(Alignment.TopCenter)
        ) {
            WalletBar(
                modifier = Modifier
                    .align(Alignment.Center)
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
            )
        }
    }
}

/** Virtual-coin balance pill with a wallet shortcut button, shown in the top bar. */
@Composable
private fun WalletBar(modifier: Modifier = Modifier, balance: Int = 0) {
    Row(
        modifier = modifier
            .height(44.dp)
            .clip(RoundedCornerShape(50))
            .background(PillBg)
            .border(1.dp, WalletRedBright.copy(alpha = 0.55f), RoundedCornerShape(50))
            .padding(horizontal = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(34.dp)
                .clip(CircleShape)
                .background(Brush.radialGradient(listOf(CoinGoldLight, CoinGoldDark))),
            contentAlignment = Alignment.Center
        ) {
            Text("₹", color = Color(0xFF6B3F0A), fontWeight = FontWeight.Bold, fontSize = 16.sp)
        }

        Spacer(modifier = Modifier.width(8.dp))

        Text("₹$balance", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)

        Spacer(modifier = Modifier.weight(1f))

        Icon(Icons.Filled.ArrowDropDown, contentDescription = null, tint = Color(0xFFAAAAAA))

        Spacer(modifier = Modifier.width(6.dp))

        Box(
            modifier = Modifier
                .size(38.dp)
                .clip(CircleShape)
                .background(Brush.verticalGradient(listOf(WalletRedBright, WalletRedDark))),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                Icons.Filled.AccountBalanceWallet,
                contentDescription = "Wallet",
                tint = Color.White,
                modifier = Modifier.size(20.dp)
            )
        }
    }
}
