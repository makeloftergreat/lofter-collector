"""
LOFTER Cookie 同步脚本
======================
用法：
  1. 先用 Edge 登录 LOFTER（带 --remote-debugging-port=9222 启动）
  2. 运行: python sync_cookie.py
  3. 脚本会自动从浏览器提取 Cookie 并上传到 Supabase

配置：
  将以下信息写入同目录的 .env 文件：
    SUPABASE_URL=https://zrxvibalglblsjbzlzut.supabase.co
    SUPABASE_SERVICE_KEY=你的service_role_key
    COOKIE_SYNC_SECRET=与Vercel端相同的密钥
    BLOG_NAME=你的LOFTER博客名
"""

import json
import os
import sys
import urllib.request
import urllib.error
from http.cookiejar import Cookie

# ============ 配置 ============
CDP_PORT = 9222
LOFTER_DOMAIN = "www.lofter.com"

def load_env():
    """从 .env 文件加载配置"""
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    config = {}
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    config[k.strip()] = v.strip()
    return config

def get_cdp_ws_url(port):
    """通过 CDP HTTP 接口获取 WebSocket 调试 URL"""
    url = f"http://127.0.0.1:{port}/json"
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            targets = json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as e:
        print(f"[ERROR] 无法连接 CDP 端口 {port}，请确认 Edge 已带 --remote-debugging-port={port} 启动")
        print(f"  启动命令: start msedge --remote-debugging-port={port}")
        sys.exit(1)

    # 找一个 page 类型的 tab
    for target in targets:
        if target.get("type") == "page":
            return target.get("webSocketDebuggerUrl")

    print("[ERROR] 没有找到可用的浏览器页面")
    sys.exit(1)

def get_cookies_via_cdp(port):
    """通过 CDP 的 Network.getAllCookies 获取所有 Cookie"""
    # 使用 CDP HTTP 接口直接发命令（不需要 WebSocket）
    # 利用 /json/protocol 不行，需要用 WebSocket
    # 这里用更简单的方式：通过 CDP 的 Runtime.evaluate 执行 document.cookie

    import websocket  # pip install websocket-client

    ws_url = get_cdp_ws_url(port)
    if not ws_url:
        print("[ERROR] 无法获取 WebSocket URL")
        sys.exit(1)

    ws = websocket.create_connection(ws_url, timeout=10)

    # 先导航到 LOFTER 确保能拿到对应域名的 Cookie
    msg = json.dumps({
        "id": 1,
        "method": "Network.getAllCookies"
    })
    ws.send(msg)
    result = json.loads(ws.recv())

    ws.close()

    cookies = result.get("result", {}).get("cookies", [])

    # 过滤 LOFTER 相关的 Cookie
    lofter_cookies = []
    for c in cookies:
        domain = c.get("domain", "")
        if "lofter.com" in domain:
            lofter_cookies.append(c)

    return lofter_cookies

def cookies_to_header(cookies):
    """将 CDP Cookie 列表转为 HTTP Cookie 头格式"""
    parts = []
    for c in cookies:
        parts.append(f"{c['name']}={c['value']}")
    return "; ".join(parts)

def upload_to_supabase(config, cookie_str, blog_name):
    """上传 Cookie 到 Supabase"""
    supabase_url = config.get("SUPABASE_URL", "")
    service_key = config.get("SUPABASE_SERVICE_KEY", "")

    if not supabase_url or not service_key:
        print("[ERROR] 缺少 SUPABASE_URL 或 SUPABASE_SERVICE_KEY")
        print("  请在 .env 文件中配置")
        sys.exit(1)

    # 先删除旧 Cookie，再插入新 Cookie
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

    # 删除旧记录
    delete_url = f"{supabase_url}/rest/v1/lofter_cookies?id=gt.0"
    del_req = urllib.request.Request(delete_url, method="DELETE", headers=headers)
    try:
        urllib.request.urlopen(del_req, timeout=10)
    except urllib.error.URLError as e:
        print(f"[WARN] 删除旧 Cookie 失败: {e}")

    # 插入新记录
    insert_url = f"{supabase_url}/rest/v1/lofter_cookies"
    data = json.dumps({
        "cookie": cookie_str,
        "blog_name": blog_name,
        "status": "active"
    }).encode("utf-8")

    insert_req = urllib.request.Request(insert_url, data=data, headers=headers, method="POST")
    try:
        urllib.request.urlopen(insert_req, timeout=10)
        print(f"[OK] Cookie 已上传到 Supabase (blog: {blog_name})")
    except urllib.error.URLError as e:
        print(f"[ERROR] 上传 Cookie 失败: {e}")
        sys.exit(1)

def test_cookie(cookie_str):
    """用 Cookie 测试访问 LOFTER，验证是否有效"""
    test_url = "https://www.lofter.com/dwr/call/plaincall/PostBean.getPostResponses.dwr"
    headers = {
        "Cookie": cookie_str,
        "Content-Type": "text/plain",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
    # 简单发个请求看是否 200
    data = b"callCount=1\nwindowName=\nhttpSessionId=\nscriptSessionId=\nc0-scriptName=PostBean\nc0-methodName=getPostResponses\nc0-id=0\nc0-param0=string:1\nc0-param1=number:0\nc0-param2=number:1\nbatchId=0\n"

    req = urllib.request.Request(test_url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode("utf-8", errors="ignore")
            if "throw" in body and "login" in body.lower():
                print("[WARN] Cookie 可能已失效（返回登录提示）")
                return False
            else:
                print("[OK] Cookie 验证通过")
                return True
    except urllib.error.HTTPError as e:
        if e.code == 302:
            print("[WARN] Cookie 已失效（302 重定向到登录页）")
            return False
        print(f"[WARN] Cookie 验证异常: HTTP {e.code}")
        return False
    except Exception as e:
        print(f"[WARN] Cookie 验证异常: {e}")
        return False

def main():
    print("=" * 50)
    print("  LOFTER Cookie 同步工具")
    print("=" * 50)

    config = load_env()
    blog_name = config.get("BLOG_NAME", "")

    if not blog_name:
        blog_name = input("请输入你的 LOFTER 博客名: ").strip()
        if not blog_name:
            print("[ERROR] 博客名不能为空")
            sys.exit(1)

    print(f"\n[1/4] 连接 Edge (CDP 端口 {CDP_PORT})...")
    try:
        import websocket
    except ImportError:
        print("[INFO] 安装 websocket-client...")
        os.system(f"{sys.executable} -m pip install websocket-client -q")
        import websocket

    print(f"[2/4] 提取 LOFTER Cookie...")
    cookies = get_cookies_via_cdp(CDP_PORT)

    if not cookies:
        print("[ERROR] 未找到 LOFTER Cookie，请先在浏览器中登录 www.lofter.com")
        sys.exit(1)

    cookie_str = cookies_to_header(cookies)
    print(f"  找到 {len(cookies)} 个 Cookie")

    print(f"[3/4] 验证 Cookie 有效性...")
    test_cookie(cookie_str)

    print(f"[4/4] 上传到 Supabase...")
    upload_to_supabase(config, cookie_str, blog_name)

    print("\n[DONE] 同步完成！Vercel 端现在可以使用此 Cookie 采集数据了。")
    print(f"  Cookie 有效期通常 7-30 天，过期后重新运行此脚本即可。")

if __name__ == "__main__":
    main()
