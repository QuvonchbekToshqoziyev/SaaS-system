server {
    listen 80;
    server_name b2b.booking.ado-finance.com;

    # Redirect HTTP → HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name b2b.booking.ado-finance.com;

    # SSL — replace with real cert paths or use Let's Encrypt (certbot)
    ssl_certificate     /etc/letsencrypt/live/b2b.booking.ado-finance.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/b2b.booking.ado-finance.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # Next.js static export output directory
    root /var/www/b2b.booking.ado-finance.com/html;
    index index.html;

    # Proxy API calls to Express backend (PM2) on port 5000
    location /api/ {
        proxy_pass         http://127.0.0.1:5000/;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    # Serve Next.js static export with deep-link support
    location / {
        try_files $uri $uri/ $uri/index.html =404;
    }

    # Security headers
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    add_header Referrer-Policy strict-origin-when-cross-origin;
}
