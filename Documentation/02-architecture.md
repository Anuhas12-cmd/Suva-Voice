# Architecture

```
Customer app ──┐
               ├── REST API ── PostgreSQL
Admin website ─┘       │
                       ├── Scheduler
                       ├── Notification service
                       ├── Demo payment gateway
                       └── Voice client
                               │
                        Local voice server
                               │
                     Demo timers or Asterisk AMI
                               │
                          SIP / telephone
                               │
                         Elderly person
                               │
                          DTMF 1 / 2 / 3
                               │
                            REST API
                          /            \
                 Customer app        Admin website
```

Socket.IO pushes `suva:update` to the signed-in user and to the staff room after a call result, alert, order change, or notification. Both clients refetch the screen they are showing.

Demo mode and a future Asterisk call share `processDtmf` and `processFailure`. The keypad buttons in the apps are not a separate fake status update.
