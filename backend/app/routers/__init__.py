from app.routers import auth
from app.routers import setup
from app.routers import projects
from app.routers import work_items
from app.routers import iterations
from app.routers import initiatives
from app.routers import workflows
from app.routers import labels
from app.routers import spaces
from app.routers import boards
from app.routers import columns
from app.routers import cards
from app.routers import checklists
from app.routers import vault
from app.routers import assistant
from app.routers import settings
from app.routers import reports
from app.routers import guides
from app.routers import search
from app.routers import uploads
from app.routers import admin
from app.routers import system
from app.routers import dashboard

all_routers = [
    auth.router,
    setup.router,
    projects.router,
    work_items.router,
    iterations.router,
    initiatives.router,
    workflows.router,
    labels.router,
    spaces.router,
    boards.router,
    columns.router,
    cards.router,
    checklists.router,
    vault.router,
    assistant.router,
    settings.router,
    reports.router,
    guides.router,
    search.router,
    uploads.router,
    admin.router,
    system.router,
    dashboard.router,
]
