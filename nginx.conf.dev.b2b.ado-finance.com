limit_req_zone $binary_remote_addr zone=ado_dev_login:10m rate=120r/m;

server {
    listen 80;
    server_name dev.b2b.booking.ado-finance.com;

    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name dev.b2b.booking.ado-finance.com;

    ssl_certificate     /etc/letsencrypt/live/dev.b2b.booking.ado-finance.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dev.b2b.booking.ado-finance.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    server_tokens       off;

    root /var/www/dev.b2b.booking.ado-finance.com/html;
    index index.html;

    location = /api/auth/login {
        limit_req zone=ado_dev_login burst=120 nodelay;
        limit_req_status 429;
        proxy_pass         http://127.0.0.1:5001/auth/login;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }

    location /api/ {
        proxy_pass         http://127.0.0.1:5001/;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    location / {
        try_files $uri $uri/ $uri/index.html =404;
    }

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; img-src 'self' data:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; upgrade-insecure-requests" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
}
