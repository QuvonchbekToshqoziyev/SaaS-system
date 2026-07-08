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

    root /var/www/dev.b2b.booking.ado-finance.com/html;
    index index.html;

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

    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    add_header Referrer-Policy strict-origin-when-cross-origin;
}
