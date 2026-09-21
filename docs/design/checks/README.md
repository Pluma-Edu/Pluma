# Running the checks

These are not tests of application code — there isn't any yet. They are the
evidence for the claims made in `../01-data-model.md`: that the DDL applies,
that the mastery formula behaves the way I say it does, and that the hard
constraints are enforced by the database rather than by convention.

```sh
createdb pluma_check
psql -v ON_ERROR_STOP=1 -f ../01-data-model.sql          pluma_check
psql -v ON_ERROR_STOP=1 -f mastery_scenarios.sql         pluma_check
psql -f mastery_readout.sql                              pluma_check
psql -f constraints.sql                                  pluma_check
```

`constraints.sql` expects every line to read `blocked`. A `LEAKED` line means a
hard constraint is enforceable only in application code, which is where hard
constraints go to die.
