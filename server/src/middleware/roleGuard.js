const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const ROLE_HIERARCHY = {
  OWNER: 4,
  EDITOR: 3,
  UPLOADER: 2,
  VIEWER: 1,
};

function requireProjectRole(...allowedRoles) {
  return async (req, res, next) => {
    const projectId = req.params.id || req.params.projectId;
    if (!projectId) {
      return res.status(400).json({ error: 'Project ID required' });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        members: { where: { userId: req.user.id } },
      },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Owner always has access via ownerId
    if (project.ownerId === req.user.id) {
      req.projectRole = 'OWNER';
      req.project = project;
      return next();
    }

    const membership = project.members[0];
    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this project' });
    }

    if (!allowedRoles.includes(membership.role)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: allowedRoles,
        current: membership.role,
      });
    }

    req.projectRole = membership.role;
    req.project = project;
    next();
  };
}

function requireMinRole(minRole) {
  const minLevel = ROLE_HIERARCHY[minRole];
  const allowed = Object.entries(ROLE_HIERARCHY)
    .filter(([, level]) => level >= minLevel)
    .map(([role]) => role);
  return requireProjectRole(...allowed);
}

module.exports = { requireProjectRole, requireMinRole };
