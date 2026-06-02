-- Pink-heart reactions were stored as "care"; catalog now uses care = hug and love = heart.
UPDATE "PostReaction" SET kind = 'love' WHERE kind = 'care';
