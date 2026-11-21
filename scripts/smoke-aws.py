"""Exercise the deployed stack with disposable identities; never print credentials.
Usage: AWS_PROFILE=margin python3 scripts/smoke-aws.py margin us-east-1
"""
import base64
import json
import os
import secrets
import subprocess
import sys
import urllib.request
import urllib.error
import uuid
import boto3

stack = sys.argv[1] if len(sys.argv) > 1 else 'margin'
region = sys.argv[2] if len(sys.argv) > 2 else 'us-east-1'

# Export this profile's temporary credentials into process memory only.
# This also supports aws-login profiles with older boto3 credential providers.
credential_result = subprocess.run(
    ['aws', 'configure', 'export-credentials', '--format', 'process'],
    text=True, capture_output=True)
if credential_result.returncode:
    raise RuntimeError('Unable to load temporary AWS profile credentials')
credentials = json.loads(credential_result.stdout)
session = boto3.Session(
    aws_access_key_id=credentials['AccessKeyId'],
    aws_secret_access_key=credentials['SecretAccessKey'],
    aws_session_token=credentials.get('SessionToken'), region_name=region)
clients = {}

def aws(service, operation, payload):
    service = 's3' if service == 's3api' else service
    if service not in clients:
        clients[service] = session.client(service)
    return getattr(clients[service], operation.replace('-', '_'))(**payload)

outputs = aws('cloudformation', 'describe-stacks', {'StackName': stack})['Stacks'][0]['Outputs']
config = {entry['OutputKey']: entry['OutputValue'] for entry in outputs}
api, origin = config['ApiUrl'], config['WebsiteUrl']
users, books, cover_keys = [], [], []

def request(path, method='GET', body=None, token=None):
    headers = {'Origin': origin}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    if body is not None:
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(api + path, method=method, headers=headers,
                                 data=json.dumps(body).encode() if body is not None else None)
    try:
        response = urllib.request.urlopen(req, timeout=40)
    except urllib.error.HTTPError as error:
        response = error
    raw = response.read()
    return response.status, json.loads(raw) if raw else None, response.headers

def check(condition, message):
    if not condition:
        raise AssertionError(message)
    print('PASS:', message, flush=True)

try:
    status, result, headers = request('/api/health')
    check(status == 200 and result.get('ok'), 'Public health endpoint')
    check(headers.get('Access-Control-Allow-Origin') == origin, 'API CORS matches CloudFront origin')
    check(request('/api/books')[0] == 401, 'Private API rejects missing authentication')
    check(request('/api/books', token='invalid')[0] == 401, 'Private API rejects invalid authentication')
    check(request('/api/books', method='OPTIONS')[0] == 200, 'Unauthenticated CORS preflight')
    for _ in range(2):
        email = 'margin-smoke-' + uuid.uuid4().hex + '@example.com'
        password = 'Aa1!' + secrets.token_urlsafe(32)
        aws('cognito-idp', 'admin-create-user', {
            'UserPoolId': config['CognitoUserPoolId'], 'Username': email,
            'MessageAction': 'SUPPRESS', 'UserAttributes': [{'Name': 'email', 'Value': email}]})
        users.append({'email': email})
        aws('cognito-idp', 'admin-set-user-password', {
            'UserPoolId': config['CognitoUserPoolId'], 'Username': email,
            'Password': password, 'Permanent': True})
        auth = aws('cognito-idp', 'initiate-auth', {'ClientId': config['CognitoClientId'],
            'AuthFlow': 'USER_PASSWORD_AUTH', 'AuthParameters': {'USERNAME': email, 'PASSWORD': password}})
        users[-1]['token'] = auth['AuthenticationResult']['IdToken']
    alice, bob = users[0]['token'], users[1]['token']
    check(True, 'Cognito authenticates two disposable users (no emails sent)')
    book = {'title': 'AWS smoke-test book', 'author': 'Disposable verification', 'genre': 'Testing',
            'status': 'to-read', 'rating': None, 'finishedAt': None, 'nextUp': True, 'coverKey': None}
    status, saved, _ = request('/api/books', 'POST', book, alice)
    check(status == 201, f'Lambda writes book to DynamoDB (HTTP {status}, error={saved.get("error", saved.get("message", "none"))})')
    book_id = saved['id']
    books.append((book_id, alice))
    check(any(b['id'] == book_id for b in request('/api/books', token=alice)[1]), 'DynamoDB persistence')
    check(request('/api/books', token=bob)[1] == [], 'Second user cannot list first user books')
    check(request('/api/books/' + book_id, 'PUT', book, bob)[0] == 404, 'Cross-user edits rejected')
    entry_path = '/api/books/' + book_id + '/entries'
    check(request(entry_path, 'POST', {'kind': 'highlight', 'text': 'Too early'}, alice)[0] == 409, 'Highlight workflow enforced')
    check(request(entry_path, 'POST', {'kind': 'note', 'text': 'Private smoke-test note'}, alice)[0] == 201, 'Private notes persist')
    status, shared, _ = request('/api/share', 'POST', token=alice)
    check(status == 200, 'Public shortlist enabled')
    status, public, _ = request('/api/public/' + shared['token'])
    check(status == 200 and len(public['books']) == 1 and set(public['books'][0]) == {'title', 'author', 'genre', 'status'}, 'Public list excludes private fields')
    request('/api/share', 'DELETE', token=alice)
    check(request('/api/public/' + shared['token'])[0] == 404, 'Sharing revocation takes effect')
    book.update(status='reading')
    status, updated, _ = request('/api/books/' + book_id, 'PUT', book, alice)
    check(status == 200 and updated['nextUp'] is False, 'Starting reading clears shortlist pin')
    check(request(entry_path, 'POST', {'kind': 'highlight', 'text': 'A test passage', 'page': 1}, alice)[0] == 201, 'Started book accepts highlights')
    png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6wS8AAAAASUVORK5CYII=')
    cover_path = '/api/books/' + book_id + '/cover'
    status, upload, _ = request(cover_path, 'POST', {'contentType': 'image/png', 'size': len(png)}, alice)
    check(status == 200, 'Signed S3 upload issued')
    cover_keys.append(upload['key'])
    with urllib.request.urlopen(urllib.request.Request(upload['url'], data=png, method='PUT', headers={'Content-Type': 'image/png', 'Origin': origin}), timeout=30) as response:
        check(response.status == 200, 'Cover uploaded to private S3 bucket')
        check(response.headers.get('Access-Control-Allow-Origin') == origin, 'S3 upload CORS allows frontend')
    book.update(coverKey=upload['key'], status='finished', finishedAt='2026-11-21', rating=5)
    check(request('/api/books/' + book_id, 'PUT', book, alice)[0] == 200, 'Finished book and cover saved')
    status, cover, _ = request(cover_path, token=alice)
    check(status == 200, 'Signed S3 read issued')
    with urllib.request.urlopen(cover['url'], timeout=30) as response:
        check(response.read() == png, 'Private cover downloaded via signed URL')
    check(request(cover_path, token=bob)[0] == 404, 'Foreign cover access rejected')
    status, stats, _ = request('/api/stats', token=alice)
    check(status == 200 and stats['finished'] == 1 and stats['averageRating'] == 5, 'Reading statistics computed from stored records')
    status, catalog, _ = request('/api/catalog?q=The%20Dispossessed', token=alice)
    check(status == 200 and len(catalog) > 0, 'Deployed Lambda reaches real Open Library catalog')
finally:
    cleanup_errors = []
    for book_id, token in books:
        try:
            if request('/api/books/' + book_id, 'DELETE', token=token)[0] != 204:
                raise RuntimeError('Book cleanup failed')
        except Exception:
            cleanup_errors.append('test book')
    for user in users:
        try:
            if user.get('token'):
                request('/api/share', 'DELETE', token=user['token'])
            aws('cognito-idp', 'admin-delete-user', {'UserPoolId': config['CognitoUserPoolId'], 'Username': user['email']})
        except Exception:
            cleanup_errors.append('test user')
    for key in cover_keys:
        try:
            aws('s3api', 'delete-object', {'Bucket': config['CoversBucketName'], 'Key': key})
        except Exception:
            cleanup_errors.append('test cover')
    if cleanup_errors:
        raise RuntimeError('Cleanup needs attention: ' + ', '.join(cleanup_errors))
    print('Disposable test records, users and covers cleaned up.', flush=True)
