"""Named neurons of interest. Data only — no simulator imports.

Kept separate from the experiment drivers so that any consumer (export scripts,
the web build, analysis notebooks) can use these IDs without pulling in Brian2.
"""

# Sugar-sensing neurons, right hemisphere. Verbatim from the reference notebook of
# philshiu/Drosophila_brain_model (Shiu et al., Nature 2024).
NEU_SUGAR = [
    720575940624963786, 720575940630233916, 720575940637568838, 720575940638202345,
    720575940617000768, 720575940630797113, 720575940632889389, 720575940621754367,
    720575940621502051, 720575940640649691, 720575940639332736, 720575940616885538,
    720575940639198653, 720575940620900446, 720575940617937543, 720575940632425919,
    720575940633143833, 720575940612670570, 720575940628853239, 720575940629176663,
    720575940611875570,
]

# MN9: motor neuron driving proboscis extension. The behavioural readout of Phase 1,
# and in Phase 5 the descending command that becomes the dragon's fire breath.
ID_MN9 = 720575940660219265
