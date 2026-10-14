<?php
// StockPay "Add Money" for your shop server (PHP 7.4+ with curl).
//
// Setup:
//   1. Upload this file to your website, e.g. https://yourshop.com/stockpay.php
//   2. Fill STOCKPAY_KEY and STOCKPAY_WEBHOOK_SECRET below (or set them as environment variables).
//        STOCKPAY_KEY             sk_test_...  (later sk_live_...)   StockPay admin → API Keys
//        STOCKPAY_WEBHOOK_SECRET  whsec_...                           StockPay admin → API Keys
//   3. In StockPay admin → API Keys, set the Webhook URL to:
//        https://yourshop.com/stockpay.php?action=webhook
//   4. Edit only the two functions marked "EDIT 1" and "EDIT 2".
//
// Calls:
//   POST stockpay.php?action=add-money   {"amount":200}  →  {"payment_url":"...","order_id":"..."}
//   GET  stockpay.php?action=status&id=ord_...           →  {"status":"paid", "amount":200}
//   POST stockpay.php?action=webhook     (StockPay calls this when money arrives)

define('STOCKPAY_API', getenv('STOCKPAY_API') ?: 'https://stockpay-in.vercel.app/api/v1');
define('STOCKPAY_KEY', getenv('STOCKPAY_KEY') ?: 'sk_test_PASTE_YOUR_KEY_HERE');
define('STOCKPAY_WEBHOOK_SECRET', getenv('STOCKPAY_WEBHOOK_SECRET') ?: 'whsec_PASTE_YOUR_SECRET_HERE');

// The amounts your app shows. Only these can be added.
const STOCKPAY_AMOUNTS = [200, 400, 600, 800, 1000];

// Where the customer lands after paying ('' = stay on the StockPay "Payment received" screen).
const STOCKPAY_RETURN_URL = ''; // e.g. 'https://yourshop.com/wallet'

// ─────────────────────────────────────────────────────────────────────────────
// EDIT 1: return the logged-in user's id (the same way your other pages do it), or null.
function stockpay_user_id() {
    if (session_status() === PHP_SESSION_NONE) session_start();
    return $_SESSION['user_id'] ?? null;
}

// EDIT 2: add money to the user's wallet in YOUR database.
// IMPORTANT: save $orderId and do nothing if it was already credited (the webhook can arrive twice).
// Throw an Exception if saving fails — StockPay will retry later.
function stockpay_credit_wallet($userId, $amount, $orderId) {
    // Example (PDO / MySQL), wallet_txn.order_id must be UNIQUE:
    //   global $pdo;
    //   $pdo->beginTransaction();
    //   $ins = $pdo->prepare('INSERT IGNORE INTO wallet_txn (order_id, user_id, amount) VALUES (?, ?, ?)');
    //   $ins->execute([$orderId, $userId, $amount]);
    //   if ($ins->rowCount() === 1) {
    //       $pdo->prepare('UPDATE users SET balance = balance + ? WHERE id = ?')->execute([$amount, $userId]);
    //   }
    //   $pdo->commit();
    throw new Exception('stockpay_credit_wallet() is not connected to your database yet');
}
// ─────────────────────────────────────────────────────────────────────────────

function stockpay_call($path, $method = 'GET', $body = null) {
    $ch = curl_init(STOCKPAY_API . $path);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . STOCKPAY_KEY, 'Content-Type: application/json'],
    ]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    $res = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $data = json_decode((string) $res, true) ?: [];
    if ($code < 200 || $code >= 300) throw new Exception($data['error']['message'] ?? "StockPay error $code");
    return $data;
}

// Reference = "ADD-<userId>-<random>", so the webhook knows whose wallet to credit.
function stockpay_user_from_reference($ref) {
    return preg_match('/^ADD-(.+)-[0-9A-F]{8}$/', (string) $ref, $m) ? $m[1] : null;
}

function stockpay_json($code, $data) {
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

$action = $_GET['action'] ?? '';

// 1) App button "₹200" → create a payment and get the link to open.
if ($action === 'add-money' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $userId = stockpay_user_id();
    if (!$userId) stockpay_json(401, ['error' => 'Please log in']);
    $in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $amount = (int) ($in['amount'] ?? 0);
    if (!in_array($amount, STOCKPAY_AMOUNTS, true)) stockpay_json(400, ['error' => 'Choose one of: ' . implode(', ', STOCKPAY_AMOUNTS)]);
    try {
        $body = [
            'amount' => $amount,
            'reference' => 'ADD-' . $userId . '-' . strtoupper(bin2hex(random_bytes(4))),
            'note' => "Add money ₹$amount",
        ];
        if (STOCKPAY_RETURN_URL) $body['return_url'] = STOCKPAY_RETURN_URL;
        $order = stockpay_call('/orders', 'POST', $body);
        stockpay_json(200, ['payment_url' => $order['payment_url'], 'order_id' => $order['id']]);
    } catch (Exception $e) {
        error_log('StockPay add-money: ' . $e->getMessage());
        stockpay_json(502, ['error' => 'Payment could not be started, please try again']);
    }
}

// 2) Optional: the app can ask "is it paid yet?"
if ($action === 'status') {
    try {
        $order = stockpay_call('/orders/' . rawurlencode($_GET['id'] ?? ''));
        if (stockpay_user_from_reference($order['reference']) !== (string) stockpay_user_id()) stockpay_json(404, ['error' => 'Not found']);
        stockpay_json(200, ['status' => $order['status'], 'amount' => (float) $order['amount']]);
    } catch (Exception $e) {
        stockpay_json(404, ['error' => 'Not found']);
    }
}

// 3) StockPay → your server when money arrives. Adds the balance automatically.
if ($action === 'webhook' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $raw = file_get_contents('php://input');
    $ts = $_SERVER['HTTP_X_STOCKPAY_TIMESTAMP'] ?? '';
    $sig = $_SERVER['HTTP_X_STOCKPAY_SIGNATURE'] ?? '';
    $expected = 'sha256=' . hash_hmac('sha256', $ts . '.' . $raw, STOCKPAY_WEBHOOK_SECRET);
    if (!$ts || abs(time() - (int) $ts) > 300 || !hash_equals($expected, $sig)) stockpay_json(401, ['error' => 'bad signature']);

    $event = json_decode($raw, true);
    if (($event['event'] ?? '') !== 'order.paid') stockpay_json(200, ['ok' => true]);
    try {
        // Double-check with StockPay itself before giving money.
        $order = stockpay_call('/orders/' . rawurlencode($event['order']['id'] ?? ''));
        $userId = stockpay_user_from_reference($order['reference']);
        if ($order['status'] === 'paid' && $userId !== null) {
            stockpay_credit_wallet($userId, (float) $order['amount'], $order['id']);
        }
        stockpay_json(200, ['ok' => true]);
    } catch (Exception $e) {
        error_log('StockPay webhook: ' . $e->getMessage());
        stockpay_json(500, ['error' => 'try again later']); // StockPay retries automatically
    }
}

stockpay_json(404, ['error' => 'Unknown action']);
