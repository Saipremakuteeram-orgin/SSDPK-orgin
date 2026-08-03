import json

with open('i18n/en.json', 'r') as f:
    data = json.load(f)

keys_to_check = [
    'events.prevMonth', 'events.nextMonth', 'gallery.pageSubtitle',
    'trustees.pageTitle', 'trustees.pageSubtitle',
    'about.spiritualActivities', 'about.sevaActivities', 'about.education',
    'about.publications', 'about.ourImpact',
    'login.phoneEmail', 'login.password', 'login.loginBtn',
    'signup.registerBtn', 'resetPassword.resetSubtitle', 'nav.signOut'
]

for k in keys_to_check:
    parts = k.split('.')
    obj = data
    found = True
    for p in parts:
        if p in obj:
            obj = obj[p]
        else:
            found = False
            break
    status = 'EXISTS' if found else 'MISSING'
    print(k + ': ' + status)