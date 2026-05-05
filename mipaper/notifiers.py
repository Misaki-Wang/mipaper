from __future__ import annotations

import os
import socket
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage
from urllib.parse import urlparse


DEFAULT_SMTP_PROXY_HOST = "127.0.0.1"
DEFAULT_SMTP_PROXY_PORT = 7890


@dataclass(frozen=True)
class SMTPProxyConfig:
    host: str
    port: int
    kind: str = "socks5"


class EmailNotifier:
    def __init__(self) -> None:
        self.host = require_env("COOL_PAPER_SMTP_HOST")
        self.port = int(os.getenv("COOL_PAPER_SMTP_PORT", "587"))
        self.username = require_env("COOL_PAPER_SMTP_USERNAME")
        self.password = require_env("COOL_PAPER_SMTP_PASSWORD")
        self.sender = require_env("COOL_PAPER_EMAIL_FROM")
        self.recipients = resolve_recipients()
        self.security = os.getenv("COOL_PAPER_SMTP_SECURITY", "starttls").lower()
        self.timeout = float(os.getenv("COOL_PAPER_SMTP_TIMEOUT_SECONDS", "30"))
        self.proxy = resolve_smtp_proxy_config()

    def send(self, subject: str, body: str, html_body: str | None = None) -> None:
        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = self.sender
        message["To"] = ", ".join(self.recipients)
        message.set_content(body)
        if html_body:
            message.add_alternative(html_body, subtype="html")

        if self.security == "ssl":
            self._send_with_retry(message, use_ssl=True)
            return

        self._send_with_retry(message, use_ssl=False)

    def _send_with_retry(self, message: EmailMessage, *, use_ssl: bool) -> None:
        errors: list[Exception] = []
        proxy_options = [self.proxy] if self.proxy else []
        proxy_options.append(None)
        tried: set[tuple[str, int, str | None, int | None]] = set()

        for proxy in proxy_options:
            hosts = smtp_delivery_hosts(self.host, self.port, use_proxy=proxy is not None)
            for host in hosts:
                key = (host, self.port, proxy.host if proxy else None, proxy.port if proxy else None)
                if key in tried:
                    continue
                tried.add(key)
                try:
                    if use_ssl:
                        with smtp_ssl_client(host, self.port, timeout=self.timeout, proxy=proxy) as smtp:
                            smtp.login(self.username, self.password)
                            smtp.send_message(message)
                        return

                    with smtp_client(host, self.port, timeout=self.timeout, proxy=proxy) as smtp:
                        if self.security == "starttls":
                            smtp.starttls()
                        smtp.login(self.username, self.password)
                        smtp.send_message(message)
                    return
                except (OSError, smtplib.SMTPException) as exc:
                    errors.append(exc)

        if errors:
            raise errors[-1]
        raise OSError(f"No SMTP host candidates resolved for {self.host}:{self.port}")


class ProxiedSMTP(smtplib.SMTP):
    def __init__(self, *args: object, proxy: SMTPProxyConfig, **kwargs: object) -> None:
        self._smtp_proxy = proxy
        super().__init__(*args, **kwargs)

    def _get_socket(self, host: str, port: int, timeout: float) -> socket.socket:
        return open_proxy_socket(self._smtp_proxy, host, port, timeout)


class ProxiedSMTPSSL(smtplib.SMTP_SSL):
    def __init__(self, *args: object, proxy: SMTPProxyConfig, **kwargs: object) -> None:
        self._smtp_proxy = proxy
        super().__init__(*args, **kwargs)

    def _get_socket(self, host: str, port: int, timeout: float) -> socket.socket:
        raw_socket = open_proxy_socket(self._smtp_proxy, host, port, timeout)
        context = self.context or ssl._create_stdlib_context()
        return context.wrap_socket(raw_socket, server_hostname=host)


def smtp_client(host: str, port: int, *, timeout: float, proxy: SMTPProxyConfig | None) -> smtplib.SMTP:
    if proxy:
        return ProxiedSMTP(host, port, timeout=timeout, proxy=proxy)
    return smtplib.SMTP(host, port, timeout=timeout)


def smtp_ssl_client(host: str, port: int, *, timeout: float, proxy: SMTPProxyConfig | None) -> smtplib.SMTP_SSL:
    if proxy:
        return ProxiedSMTPSSL(host, port, timeout=timeout, proxy=proxy)
    return smtplib.SMTP_SSL(host, port, timeout=timeout)


def open_http_connect_socket(proxy: SMTPProxyConfig, target_host: str, target_port: int, timeout: float) -> socket.socket:
    sock = socket.create_connection((proxy.host, proxy.port), timeout=timeout)
    try:
        request = (
            f"CONNECT {target_host}:{target_port} HTTP/1.1\r\n"
            f"Host: {target_host}:{target_port}\r\n"
            "Proxy-Connection: Keep-Alive\r\n"
            "\r\n"
        ).encode("ascii")
        sock.sendall(request)
        response = read_http_connect_response(sock)
        status_line = response.split(b"\r\n", 1)[0].decode("iso-8859-1", errors="replace")
        if " 200 " not in f" {status_line} ":
            raise OSError(f"SMTP proxy CONNECT failed via {proxy.host}:{proxy.port}: {status_line}")
        return sock
    except Exception:
        sock.close()
        raise


def read_http_connect_response(sock: socket.socket) -> bytes:
    chunks = bytearray()
    while b"\r\n\r\n" not in chunks:
        chunk = sock.recv(1)
        if not chunk:
            break
        chunks.extend(chunk)
        if len(chunks) > 65536:
            raise OSError("SMTP proxy CONNECT response is too large")
    response = bytes(chunks)
    if not response:
        raise OSError("SMTP proxy CONNECT returned an empty response")
    return response


def open_socks5_socket(proxy: SMTPProxyConfig, target_host: str, target_port: int, timeout: float) -> socket.socket:
    sock = socket.create_connection((proxy.host, proxy.port), timeout=timeout)
    try:
        sock.settimeout(timeout)
        sock.sendall(b"\x05\x01\x00")
        method_response = recv_exact(sock, 2)
        if method_response != b"\x05\x00":
            raise OSError(f"SMTP SOCKS5 proxy rejected no-auth negotiation: {method_response!r}")

        encoded_host = target_host.encode("idna")
        if len(encoded_host) > 255:
            raise OSError(f"SMTP SOCKS5 target host is too long: {target_host}")
        request = b"\x05\x01\x00\x03" + bytes([len(encoded_host)]) + encoded_host + target_port.to_bytes(2, "big")
        sock.sendall(request)
        header = recv_exact(sock, 4)
        if header[:2] != b"\x05\x00":
            raise OSError(f"SMTP SOCKS5 CONNECT failed: {header!r}")
        address_type = header[3]
        if address_type == 1:
            recv_exact(sock, 4)
        elif address_type == 3:
            recv_exact(sock, recv_exact(sock, 1)[0])
        elif address_type == 4:
            recv_exact(sock, 16)
        else:
            raise OSError(f"SMTP SOCKS5 proxy returned unknown address type: {address_type}")
        recv_exact(sock, 2)
        return sock
    except Exception:
        sock.close()
        raise


def recv_exact(sock: socket.socket, size: int) -> bytes:
    chunks = bytearray()
    while len(chunks) < size:
        chunk = sock.recv(size - len(chunks))
        if not chunk:
            raise OSError("SMTP SOCKS5 proxy closed the connection")
        chunks.extend(chunk)
    return bytes(chunks)


def open_proxy_socket(proxy: SMTPProxyConfig, target_host: str, target_port: int, timeout: float) -> socket.socket:
    if proxy.kind == "http-connect":
        return open_http_connect_socket(proxy, target_host, target_port, timeout)
    if proxy.kind == "socks5":
        return open_socks5_socket(proxy, target_host, target_port, timeout)
    raise OSError(f"Unsupported SMTP proxy type: {proxy.kind}")


def resolve_smtp_proxy_config() -> SMTPProxyConfig | None:
    mode = os.getenv("COOL_PAPER_SMTP_PROXY", "auto").strip().lower()
    if mode in {"0", "false", "no", "off", "none", "direct"}:
        return None

    explicit_url = os.getenv("COOL_PAPER_SMTP_PROXY_URL", "").strip()
    if explicit_url:
        return parse_proxy_url(explicit_url)

    explicit_host = os.getenv("COOL_PAPER_SMTP_PROXY_HOST", "").strip()
    explicit_port = os.getenv("COOL_PAPER_SMTP_PROXY_PORT", "").strip()
    explicit_kind = os.getenv("COOL_PAPER_SMTP_PROXY_TYPE", "socks5").strip().lower()
    if explicit_host or explicit_port:
        return SMTPProxyConfig(
            explicit_host or DEFAULT_SMTP_PROXY_HOST,
            int(explicit_port or DEFAULT_SMTP_PROXY_PORT),
            normalize_proxy_type(explicit_kind),
        )

    default_proxy = SMTPProxyConfig(DEFAULT_SMTP_PROXY_HOST, DEFAULT_SMTP_PROXY_PORT, normalize_proxy_type(explicit_kind))
    if is_tcp_reachable(default_proxy.host, default_proxy.port):
        return default_proxy

    for env_name in ("ALL_PROXY", "all_proxy", "HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"):
        proxy_url = os.getenv(env_name, "").strip()
        if proxy_url:
            try:
                return parse_proxy_url(proxy_url)
            except ValueError:
                continue

    return None


def parse_proxy_url(proxy_url: str) -> SMTPProxyConfig:
    parsed = urlparse(proxy_url)
    if parsed.scheme and parsed.scheme.lower() not in {"http", "https", "socks", "socks5"}:
        raise ValueError(f"Unsupported SMTP proxy scheme: {parsed.scheme}")
    if not parsed.hostname:
        raise ValueError(f"Invalid SMTP proxy URL: {proxy_url}")
    return SMTPProxyConfig(
        parsed.hostname,
        parsed.port or DEFAULT_SMTP_PROXY_PORT,
        normalize_proxy_type(parsed.scheme or "socks5"),
    )


def normalize_proxy_type(raw_value: str) -> str:
    normalized = raw_value.strip().lower()
    if normalized in {"", "socks", "socks5"}:
        return "socks5"
    if normalized in {"http", "https", "http-connect", "connect"}:
        return "http-connect"
    raise ValueError(f"Unsupported SMTP proxy type: {raw_value}")


def is_tcp_reachable(host: str, port: int) -> bool:
    try:
        with socket.create_connection((host, port), timeout=0.25):
            return True
    except OSError:
        return False


def require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise ValueError(f"Missing environment variable: {name}")
    return value


def resolve_recipients() -> list[str]:
    explicit_recipients = parse_csv_emails(os.getenv("COOL_PAPER_EMAIL_TO", ""))
    if explicit_recipients:
        return explicit_recipients

    allowlisted_recipients = parse_csv_emails(os.getenv("ALLOWED_EMAILS", ""))
    if allowlisted_recipients:
        return allowlisted_recipients

    raise ValueError("Missing recipient emails: set COOL_PAPER_EMAIL_TO or ALLOWED_EMAILS")


def parse_csv_emails(value: str) -> list[str]:
    return [item.strip() for item in str(value or "").split(",") if item.strip()]


def smtp_host_candidates(host: str, port: int) -> list[str]:
    candidates = [host]
    try:
        infos = socket.getaddrinfo(host, port, family=socket.AF_INET, proto=socket.IPPROTO_TCP)
    except OSError:
        return candidates

    for info in infos:
        address = info[4][0]
        if address not in candidates:
            candidates.append(address)
    return candidates


def smtp_delivery_hosts(host: str, port: int, *, use_proxy: bool) -> list[str]:
    configured_hosts = [host]
    fallback_hosts = parse_csv_emails(os.getenv("COOL_PAPER_SMTP_FALLBACK_HOSTS", ""))
    if fallback_hosts:
        configured_hosts.extend(fallback_hosts)
    elif host == "smtp.gmail.com":
        configured_hosts.append("gmail-smtp-msa.l.google.com")

    if use_proxy:
        return dedupe(configured_hosts)

    candidates: list[str] = []
    for configured_host in configured_hosts:
        candidates.extend(smtp_host_candidates(configured_host, port))
    return dedupe(candidates)


def dedupe(values: list[str]) -> list[str]:
    result: list[str] = []
    for value in values:
        if value not in result:
            result.append(value)
    return result
