from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from app.models.guide import Guide


class GuideService:
    @staticmethod
    def _serialize(guide: Guide) -> dict:
        return {
            "id": guide.id,
            "title": guide.title,
            "slug": guide.slug,
            "content": guide.content,
            "category": guide.category,
            "order": guide.order,
            "status": guide.status,
            "createdAt": guide.createdAt.isoformat() if guide.createdAt else None,
            "updatedAt": guide.updatedAt.isoformat() if guide.updatedAt else None,
        }

    @staticmethod
    async def list(db: AsyncSession, params: dict, user: dict) -> dict:
        query = select(Guide).where(True)
        if params.get("category"):
            query = query.where(Guide.category == params["category"])
        if params.get("status"):
            query = query.where(Guide.status == params["status"])
        if params.get("search"):
            search = f"%{params['search']}%"
            query = query.where(or_(Guide.title.ilike(search), Guide.content.ilike(search)))

        count_query = select(func.count()).select_from(query.subquery())
        total_result = await db.execute(count_query)
        total = total_result.scalar_one()

        page = params.get("page", 1)
        per_page = params.get("perPage", 20)
        offset = (page - 1) * per_page

        query = query.offset(offset).limit(per_page).order_by(Guide.order.asc(), Guide.createdAt.desc())
        result = await db.execute(query)
        items = result.scalars().all()

        return {
            "items": [GuideService._serialize(g) for g in items],
            "page": page,
            "perPage": per_page,
            "total": total,
            "totalPages": max(1, (total + per_page - 1) // per_page),
        }

    @staticmethod
    async def get_by_id(db: AsyncSession, guide_id: str) -> dict:
        result = await db.execute(select(Guide).where(Guide.id == guide_id))
        guide = result.scalar_one_or_none()
        if not guide:
            raise ValueError("Guide not found")
        return GuideService._serialize(guide)

    @staticmethod
    async def get_by_slug(db: AsyncSession, slug: str) -> dict:
        result = await db.execute(select(Guide).where(Guide.slug == slug))
        guide = result.scalar_one_or_none()
        if not guide:
            raise ValueError("Guide not found")
        return GuideService._serialize(guide)

    @staticmethod
    async def create(db: AsyncSession, data: dict, user: dict) -> dict:
        guide = Guide(
            id=__import__("uuid").uuid4().hex,
            title=data["title"],
            slug=data["slug"],
            content=data["content"],
            category=data["category"],
            order=data.get("order", 0),
            status=data.get("status", "PUBLISHED"),
        )
        db.add(guide)
        await db.commit()
        await db.refresh(guide)
        return GuideService._serialize(guide)
