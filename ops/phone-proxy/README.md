# phone-proxy — gọi hộ API lấy SĐT Zalo từ IP Việt Nam

**Vì sao cần:** Zalo chặn API thông tin cá nhân (`graph.zalo.me/v2.0/me/info`) khi gọi từ IP ngoài Việt Nam
(lỗi `-501` — "Personal information is limited due to IP address not inside Vietnam"). Edge function Supabase
chạy ở Seoul nên bị chặn. Edge function `zalo-phone` ký yêu cầu rồi nhờ máy này gọi hộ.

- Không lưu secret/số, không log số/token/secret. Chỉ nghe `127.0.0.1`; ra internet qua Cloudflare Tunnel.
- Chữ ký giống relay ZCA: `X-Mevo-Signature = sha256=HMAC(MEVO_HMAC_SECRET, "<timestamp>.<body>")`, lệch giờ tối đa 5 phút.
- Yêu cầu: Node >= 18, không cần cài thư viện.

## Cài trên Minipc (Ubuntu)

```bash
# 1) Đặt mã nguồn (từ máy Windows): scp proxy.mjs server.mjs ductu3590@minipc-server:~/mevo-phone-proxy/
mkdir -p ~/mevo-phone-proxy && cd ~/mevo-phone-proxy && node -v     # cần >= v18

# 2) File cấu hình (chỉ root đọc). MEVO_HMAC_SECRET phải CÙNG giá trị với relay ZCA và secret trên Supabase.
sudo sh -c 'printf "MEVO_HMAC_SECRET=<dán secret>\nPORT=3100\n" > /etc/mevo-phone-proxy.env && chmod 600 /etc/mevo-phone-proxy.env'

# 3) Chạy nền bằng systemd
sudo tee /etc/systemd/system/mevo-phone-proxy.service >/dev/null <<UNIT
[Unit]
Description=MEVO phone proxy (goi ho Zalo tu IP Viet Nam)
After=network-online.target

[Service]
User=ductu3590
WorkingDirectory=/home/ductu3590/mevo-phone-proxy
EnvironmentFile=/etc/mevo-phone-proxy.env
ExecStart=/usr/bin/env node server.mjs
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload && sudo systemctl enable --now mevo-phone-proxy
curl -s http://127.0.0.1:3100/mevo/phone/health      # -> {"ok":true}
```

Rồi thêm dòng định tuyến vào `/etc/cloudflared/config.yml`, **đặt TRÊN dòng `hostname: zalo.soccernow.net` đã có**
(cloudflared khớp từ trên xuống):

```yaml
  - hostname: zalo.soccernow.net
    path: ^/mevo/phone(/health)?$
    service: http://127.0.0.1:3100
```

`sudo systemctl restart cloudflared`, kiểm: `curl https://zalo.soccernow.net/mevo/phone/health` → `{"ok":true}`.

## Phía Supabase

Secret `MEVO_PHONE_PROXY_URL=https://zalo.soccernow.net/mevo/phone` (secret `MEVO_HMAC_SECRET` đã có sẵn).
Chưa đặt `MEVO_PHONE_PROXY_URL` thì edge function gọi thẳng Zalo như cũ (sẽ bị -501).

Xem log: `journalctl -u mevo-phone-proxy -f`.
