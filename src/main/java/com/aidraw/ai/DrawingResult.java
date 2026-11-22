package com.aidraw.ai;

/** What Claude decided the drawing is. */
public record DrawingResult(String category, String name, String description, int power,
                            String vanillaId, int count, String effectId, String mobId) {}
