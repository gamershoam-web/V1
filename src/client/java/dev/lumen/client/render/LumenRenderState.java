package dev.lumen.client.render;

import dev.lumen.bond.Bond;
import net.minecraft.client.render.entity.state.EntityRenderState;

public class LumenRenderState extends EntityRenderState {
	public Bond.Mood mood = Bond.Mood.CALM;
	public boolean thinking;
	public boolean blinking;
	public float hurtFlash;
}
