package in.apnapay.admin;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Decides which SMS may leave the phone. Only messages from bank sender IDs (AX-KOTAKB, VM-CBIBNK...)
 * that look like money received are forwarded. Personal SMS and OTPs never leave the phone.
 */
final class SmsFilter {
    private static final Pattern PHONE_NUMBER = Pattern.compile("^\\+?[0-9 \\-]{6,}$");
    private static final Pattern CREDIT = Pattern.compile("\\b(credited|credit|received|deposited|added to|cr\\.?)\\b");
    // An actual code ("OTP is 123456", "482913 is your OTP"), not just a "never share your OTP" warning.
    private static final Pattern SECRET = Pattern.compile(
        "(otp|one time password|verification code|passcode)[^0-9]{0,30}[0-9]{4,8}|[0-9]{4,8}[^0-9]{0,12}(is your|is the|as your) (otp|one time password|verification code|passcode)");
    private static final Pattern AMOUNT = Pattern.compile("(rs\\.?|inr|₹)\\s*[0-9]");

    private SmsFilter() {}

    static boolean isBankSender(String sender) {
        if (sender == null) return false;
        String s = sender.trim();
        return !s.isEmpty() && !PHONE_NUMBER.matcher(s).matches();
    }

    static boolean looksLikeCredit(String text) {
        if (text == null) return false;
        String t = text.toLowerCase(Locale.ROOT);
        return !SECRET.matcher(t).find() && CREDIT.matcher(t).find() && AMOUNT.matcher(t).find();
    }

    static boolean shouldForward(String sender, String text) {
        return isBankSender(sender) && looksLikeCredit(text);
    }
}
