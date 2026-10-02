#!/bin/sh
# Builds ApnaPay-Admin.apk without Gradle. Needs: JDK 17+, Android SDK with
#   platforms;android-35 and build-tools;35.0.0   (ANDROID_HOME points to the SDK)
#
#   ANDROID_HOME=/path/to/android-sdk sh build-apk.sh
set -e
cd "$(dirname "$0")"

SDK="${ANDROID_HOME:-/opt/android-sdk}"
BT="$SDK/build-tools/35.0.0"
JAR="$SDK/platforms/android-35/android.jar"
OUT=build
KEYSTORE="${KEYSTORE:-apnapay-release.keystore}"
KEYPASS="${KEYPASS:-apnapay123}"

rm -rf "$OUT" && mkdir -p "$OUT/res" "$OUT/classes" "$OUT/dex"

echo "1/6 Resources"
"$BT/aapt2" compile --dir res -o "$OUT/res/compiled.zip"
"$BT/aapt2" link -o "$OUT/unsigned.apk" -I "$JAR" --manifest AndroidManifest.xml -A assets \
  --java "$OUT/gen" --min-sdk-version 26 --target-sdk-version 35 "$OUT/res/compiled.zip"

echo "2/6 Java"
javac -nowarn -Xlint:-options -source 8 -target 8 -encoding UTF-8 -bootclasspath "$JAR" -d "$OUT/classes" \
  $(find src "$OUT/gen" -name '*.java')

echo "3/6 Dex"
"$BT/d8" --release --min-api 26 --lib "$JAR" --output "$OUT/dex" $(find "$OUT/classes" -name '*.class')
(cd "$OUT/dex" && zip -q -u ../unsigned.apk classes.dex)

echo "4/6 Align"
"$BT/zipalign" -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

echo "5/6 Sign"
if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair -keystore "$KEYSTORE" -alias apnapay -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$KEYPASS" -keypass "$KEYPASS" -dname "CN=ApnaPay Admin, O=ApnaPay, C=IN" >/dev/null 2>&1
fi
"$BT/apksigner" sign --ks "$KEYSTORE" --ks-pass "pass:$KEYPASS" --ks-key-alias apnapay --out ApnaPay-Admin.apk "$OUT/aligned.apk"

echo "6/6 Verify"
"$BT/apksigner" verify ApnaPay-Admin.apk
echo "Done: $(pwd)/ApnaPay-Admin.apk"
