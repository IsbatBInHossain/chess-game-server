export const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found.' })
    }

    return res.status(200).json(user)
  } catch (error) {
    console.error('Error fetching user profile:', error)
    return res.status(500).json({ error: 'Internal server error.' })
  }
}
